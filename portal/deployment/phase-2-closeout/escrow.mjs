import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {randomBytes,createCipheriv,createDecipheriv,createHash,hkdfSync} from 'node:crypto';
import pg from '/boundary/node_modules/pg/lib/index.js';
import {supabaseConnection} from '/boundary/deployment/supabase-config.mjs';
const aad=Buffer.from('GrowthCast staging runtime escrow v1');
const digest=b=>createHash('sha256').update(b).digest('hex');
const encrypt=(plain,key)=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(aad);const body=Buffer.concat([c.update(plain),c.final()]);return Buffer.concat([iv,c.getAuthTag(),body]);};
const decrypt=(bytes,key)=>{const d=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));d.setAAD(aad);d.setAuthTag(bytes.subarray(12,28));return Buffer.concat([d.update(bytes.subarray(28)),d.final()]);};
const mode=process.argv[2];
try {
if(mode==='encrypt'){
 const key=Buffer.from(readFileSync('/private/data-key','utf8'),'base64'),plain=readFileSync('/private/bundle.json');
 writeFileSync('/private/archive.bin',encrypt(plain,key),{mode:0o600});console.log(JSON.stringify({plaintextDigest:digest(plain),archiveDigest:digest(readFileSync('/private/archive.bin'))}));key.fill(0);
}else if(mode==='recover'){
 const key=Buffer.from(readFileSync('/private/data-key','utf8'),'base64'),bytes=readFileSync('/private/archive.bin');
 const bad=Buffer.from(bytes);bad[bad.length-1]^=1;assert.throws(()=>decrypt(bad,key));assert.throws(()=>decrypt(bytes,randomBytes(32)));
 const plain=decrypt(bytes,key);assert.equal(digest(plain),readFileSync('/private/expected-digest','utf8'));
 const b=JSON.parse(plain),runtime=JSON.parse(b.entries['runtime-atrium'].value),conn=JSON.parse(b.entries['connection-atrium'].value);
 const db=new pg.Client(supabaseConnection({projectRef:conn.projectRef,url:conn.databaseUrl,ca:conn.databaseCa}));
 let records=0;
 try{await db.connect();await db.query('BEGIN READ ONLY');
  const rows=(await db.query('SELECT "stripeSecretKey","stripeWebhookSecret","smtpPass","resendApiKey","paymentDetails" FROM gc_atrium.system_settings')).rows;
  process.env.SENTRY_ENABLED='false';
  const {SettingsService}=await import('/upstream/apps/api/dist/settings/settings.service.js');
  const oldSettings=new SettingsService({}, {getOrThrow:()=>runtime.secrets.BETTER_AUTH_SECRET}, {warn:()=>{}});
  const newSettings=new SettingsService({}, {getOrThrow:()=>randomBytes(32).toString('hex')}, {warn:()=>{}});
  for(const row of rows)for(const value of Object.values(row)){if(!value)continue;const clear=oldSettings.decrypt(value);assert(clear.length>0);const rotated=newSettings.encrypt(clear);assert.equal(newSettings.decrypt(rotated),clear);assert.equal(oldSettings.decrypt(rotated),'');records++;}
  assert(records>0,'Expected saved encrypted integration settings');await db.query('ROLLBACK');
 }finally{await db.end();}
 writeFileSync('/private/recovered.json',plain,{mode:0o600,flag:'wx'});key.fill(0);plain.fill(0);
 console.log(JSON.stringify({recoveredEntries:Object.keys(b.entries).length,existingEncryptedSettingsDecrypted:records,rotationRehearsal:'in-memory re-encryption and wrong-key denial',sourceDatabaseWrites:0,archiveTamperDenied:true,wrongKeyDenied:true}));
}else throw Error('Unknown mode');

} catch(e) {console.log(JSON.stringify({error:"Escrow verification failed",code:e.code??e.name,path:e.path?String(e.path).split("/").pop():undefined}));process.exitCode=1;}
