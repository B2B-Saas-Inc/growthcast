import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from '/boundary/node_modules/pg/lib/index.js';
import {supabaseConnection} from '/boundary/deployment/supabase-config.mjs';
const s=JSON.parse(readFileSync('/private/settings.json')),keys=JSON.parse(readFileSync('/private/identity.json'));
assert.equal(s.projectRef,'mdjldxussxdtcjxsoesr');assert.notEqual(keys.old,keys.runtime.secrets.BETTER_AUTH_SECRET);
const config=supabaseConnection({url:s.databaseUrl,projectRef:s.projectRef,ca:readFileSync('/private/ca.crt','utf8')});config.options='';
const db=new pg.Client(config);
try{
 await db.connect();await db.query('BEGIN');await db.query('SET LOCAL ROLE gc_migrate');
 assert.equal((await db.query("SELECT count(*)::int n FROM pg_roles WHERE rolname='gc_app' AND rolcanlogin")).rows[0].n,0);
 const {SettingsService}=await import('/upstream/apps/api/dist/settings/settings.service.js');
 const service=k=>new SettingsService({}, {getOrThrow:()=>k}, {warn:()=>{}});
 const old=service(keys.old),fresh=service(keys.runtime.secrets.BETTER_AUTH_SECRET);
 const fields=['stripeSecretKey','stripeWebhookSecret','smtpPass','resendApiKey','paymentDetails','vapidPublicKey','vapidPrivateKey'];
 const rows=(await db.query('SELECT * FROM gc_atrium.system_settings FOR UPDATE')).rows;let count=0;
 for(const row of rows)for(const field of fields){if(!row[field])continue;const clear=old.decrypt(row[field]);assert(clear);const cipher=fresh.encrypt(clear);assert.equal(fresh.decrypt(cipher),clear);assert.equal(old.decrypt(cipher),'');await db.query(`UPDATE gc_atrium.system_settings SET "${field}"=$1 WHERE id=$2`,[cipher,row.id]);count++;}
 const sessions=await db.query('DELETE FROM gc_atrium.session');
 // Push subscriptions belong to the staging browser origin; never deliver production push to those endpoints.
 const push=await db.query('DELETE FROM gc_atrium.push_subscription');
 await db.query('RESET ROLE');
 for(const [role,password] of Object.entries(keys.passwords)){assert(['gc_app','gc_documenso','gc_backup'].includes(role));assert.match(password,/^[a-f0-9]{64}$/);await db.query(`ALTER ROLE ${role} NOLOGIN PASSWORD '${password}'`);}
 await db.query('COMMIT');
 console.log(JSON.stringify({encryptedSettingsRekeyed:count,plaintextSettingsPreserved:true,productionSessionsCleared:sessions.rowCount,originBoundPushSubscriptionsCleared:push.rowCount,userPasswordsUnchanged:true,sourceWrites:0}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(JSON.stringify({stage:'identity-failed',code:e.code??e.name}));process.exitCode=1}finally{await db.end()}
