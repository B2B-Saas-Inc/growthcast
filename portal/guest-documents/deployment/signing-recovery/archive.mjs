import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomBytes,createCipheriv,createDecipheriv,createHash,X509Certificate} from 'node:crypto';
import {deliverySecrets} from '/app/guest-documents/signing/secrets.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const aad=Buffer.from('GrowthCast staging signing escrow v1');
const id='11111111-1111-4111-8111-111111111111';
const encrypt=(plain,key)=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(aad);const data=Buffer.concat([c.update(plain),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data]);};
const decrypt=(bytes,key)=>{const d=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));d.setAAD(aad);d.setAuthTag(bytes.subarray(12,28));return Buffer.concat([d.update(bytes.subarray(28)),d.final()]);};
try{
 const key=Buffer.from(readFileSync('/private/data-key','utf8'),'base64');assert.equal(key.length,32);
 if(process.argv[2]==='encrypt'){
  const bundle=JSON.parse(readFileSync('/private/bundle.json','utf8'));
  const delivery=JSON.parse(bundle.entries.delivery.value),lifecycle=JSON.parse(bundle.entries.lifecycle.value);
  bundle.witness={ciphertext:deliverySecrets(Buffer.from(delivery.encryptionKey,'hex')).seal(id,{purpose:'synthetic recovery proof'}),trustFingerprint:new X509Certificate(lifecycle.trustPem).fingerprint256};
  const plain=Buffer.from(JSON.stringify(bundle)),archive=encrypt(plain,key);
  writeFileSync('/private/archive.bin',archive,{flag:'wx',mode:0o600});
  console.log(JSON.stringify({plaintextDigest:hash(plain),archiveDigest:hash(archive)}));plain.fill(0);
 }else if(process.argv[2]==='recover'){
  const bytes=readFileSync('/private/archive.bin'),bad=Buffer.from(bytes);bad[bad.length-1]^=1;
  assert.throws(()=>decrypt(bad,key));assert.throws(()=>decrypt(bytes,randomBytes(32)));
  const plain=decrypt(bytes,key);assert.equal(hash(plain),readFileSync('/private/expected-digest','utf8'));
  const bundle=JSON.parse(plain);assert.equal(bundle.environment,'staging');assert.equal(bundle.schemaVersion,1);
  assert.deepEqual(Object.keys(bundle.entries).sort(),['delivery','gateway','lifecycle','provider']);
  const entries=Object.fromEntries(Object.entries(bundle.entries).map(([name,entry])=>[name,JSON.parse(entry.value)]));
  assert.equal(entries.delivery.encryptionKey,entries.lifecycle.config.encryptionKey);
  for(const kind of ['gateway','lifecycle']){
   const c=kind==='gateway'?entries.gateway:entries.lifecycle.config.connection;
   assert.equal(c.projectRef,'saedetvoolpdysiyjwvg');assert.equal(c.environment,'staging');assert.match(new URL(c.url).username,new RegExp('^gc_'+kind+'(?:\\.|$)'));
  }
  assert.equal(entries.delivery.providerToken,entries.provider.token);assert.equal(entries.lifecycle.config.providerToken,entries.provider.token);
  assert.equal(entries.delivery.teamId,entries.lifecycle.config.teamId);
  assert.deepEqual(deliverySecrets(Buffer.from(entries.lifecycle.config.encryptionKey,'hex')).open(id,bundle.witness.ciphertext),{purpose:'synthetic recovery proof'});
  assert.throws(()=>deliverySecrets(randomBytes(32)).open(id,bundle.witness.ciphertext));
  assert.equal(new X509Certificate(entries.lifecycle.trustPem).fingerprint256,bundle.witness.trustFingerprint);
  assert.equal(bundle.previousRuntimeEscrow.bucket,'growthcast-portal-staging-recovery-059393269249');
  console.log(JSON.stringify({recoveredEntries:4,deliveryDecryptionVerified:true,providerBindingsVerified:true,trustFingerprintVerified:true,archiveTamperDenied:true,wrongKeyDenied:true,sourceWrites:0}));plain.fill(0);
 }else throw Error();
 key.fill(0);
}catch{console.error('Signing escrow verification refused; private details suppressed');process.exitCode=1;}
