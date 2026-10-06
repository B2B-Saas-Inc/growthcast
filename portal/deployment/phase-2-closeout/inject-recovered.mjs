// Only the isolated test provisioner receives the recovered bundle; never a cloud database connection.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,chmodSync,chownSync,mkdirSync} from 'node:fs';
const service=process.argv[2];assert(['atrium','documenso'].includes(service));
execFileSync('node',['/fixture/provision.mjs',service==='atrium'?'atrium':'signing'],{stdio:'ignore'});
const db=new URL(readFileSync('/runtime/database-url','utf8'));assert.equal(db.hostname,'db.abcdefghijklmnopqrst.supabase.co');
const bundle=JSON.parse(readFileSync('/escrow/recovered.json','utf8'));assert.equal(bundle.environment,'staging');
const m=JSON.parse(bundle.entries['runtime-'+service].value);assert.equal(m.service,service);
const env=JSON.parse(readFileSync('/runtime/application-env.json','utf8'));const uid=service==='atrium'?1000:1001;
Object.assign(env,m.secrets);delete env.PORTAL_API_ORIGIN;
if(service==='atrium')writeFileSync('/origin/api-origin',m.secrets.PORTAL_API_ORIGIN,{mode:0o600});
else{
 const cert=JSON.parse(bundle.entries['signing-certificate'].value);assert.equal(cert.purpose,'staging-document-signing-only');
 writeFileSync('/runtime/signing.p12',Buffer.from(cert.p12,'base64'),{mode:0o400});chownSync('/runtime/signing.p12',uid,uid);
 writeFileSync('/runtime/signing-passphrase',cert.passphrase,{mode:0o400});
 execFileSync('openssl',['pkcs12','-in','/runtime/signing.p12','-passin','file:/runtime/signing-passphrase','-clcerts','-nokeys','-out','/runtime/signing.crt'],{stdio:'ignore'});
 chmodSync('/runtime/signing.crt',0o400);chownSync('/runtime/signing.crt',uid,uid);
 Object.assign(env,{NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH:'/run/secrets/signing.p12',NEXT_PRIVATE_SIGNING_PASSPHRASE:cert.passphrase,GROWTHCAST_SIGNING_TEST_CA:'/run/secrets/signing.crt'});
}
writeFileSync('/runtime/application-env.json',JSON.stringify(env),{mode:0o400});chmodSync('/runtime/application-env.json',0o400);chownSync('/runtime/application-env.json',uid,uid);
console.log('Recovered staging cryptographic identity installed only in isolated disposable runtime.');
