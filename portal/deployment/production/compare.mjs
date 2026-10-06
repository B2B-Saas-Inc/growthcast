import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from '/boundary/node_modules/pg/lib/index.js';
import {supabaseConnection} from '/boundary/deployment/supabase-config.mjs';
import {SettingsService} from '/upstream/apps/api/dist/settings/settings.service.js';
// Migration catalog helper is mounted from the reviewed source tree.
import {catalog} from '/deployment/managed-recovery/catalog.mjs';
const source=JSON.parse(readFileSync('/private/source-backup.json')),target=JSON.parse(readFileSync('/private/target-backup.json')),identity=JSON.parse(readFileSync('/private/identity.json'));
assert.equal(source.projectRef,'saedetvoolpdysiyjwvg');assert.equal(target.projectRef,'mdjldxussxdtcjxsoesr');
const client=c=>new pg.Client(supabaseConnection({url:c.databaseUrl,projectRef:c.projectRef,ca:c.databaseCaCert}));const a=client(source),b=client(target);
try{
 await a.connect();await b.connect();await a.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await b.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const skip=new Set(['session','push_subscription','system_settings']);const ca=await catalog(a),cb=await catalog(b);
 const kept=x=>x.filter(r=>r.schema!=='gc_atrium'||!skip.has(r.name));assert.deepEqual(kept(cb),kept(ca),'Non-transformed production records must exactly match current staging');
 const svc=k=>new SettingsService({},{getOrThrow:()=>k},{warn:()=>{}});const old=svc(identity.old),fresh=svc(identity.runtime.secrets.BETTER_AUTH_SECRET);
 const aa=(await a.query('SELECT to_jsonb(s) AS value FROM gc_atrium.system_settings s ORDER BY id')).rows.map(x=>x.value);
 const bb=(await b.query('SELECT to_jsonb(s) AS value FROM gc_atrium.system_settings s ORDER BY id')).rows.map(x=>x.value);
 const fields=['stripeSecretKey','smtpPass','resendApiKey','paymentDetails','vapidPublicKey','vapidPrivateKey'];let encrypted=0;
 for(const [rows,service] of [[aa,old],[bb,fresh]])for(const row of rows){delete row.stripeWebhookSecret;for(const f of fields)if(row[f]){row[f]=service.decrypt(row[f]);assert(row[f]);encrypted++;}}
 assert.deepEqual(bb,aa,'All workspace settings and decrypted provider credentials must match');
 const counts=Object.fromEntries(ca.filter(x=>x.schema==='gc_atrium'&&['project','user','project_budget','project_staff','client_profile','invoice'].includes(x.name)).map(x=>[x.name,x.count]));
 assert.equal((await b.query('SELECT count(*)::int n FROM gc_atrium.session')).rows[0].n,0);
 await a.query('ROLLBACK');await b.query('ROLLBACK');console.log(JSON.stringify({checkedAt:new Date().toISOString(),tablesCompared:kept(ca).length,allBusinessRecordsMatchCurrentStaging:true,settingsPlaintextPreserved:true,encryptedFieldsChecked:encrypted/2,userPasswordHashesIdentical:true,counts,productionSessionsNotCopied:true,onlyAllowedTransforms:['settings encryption key','dedicated production webhook secret','origin-bound sessions and push subscriptions']}));
}catch(e){console.error(JSON.stringify({stage:'migration-comparison-failed',name:e.name,code:e.code}));process.exitCode=1}finally{await a.end();await b.end()}
