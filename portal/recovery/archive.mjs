import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,renameSync,statSync} from 'node:fs';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
const aad=Buffer.from('GrowthCast recovery archive v1');
const mode=process.argv[2];
if(mode==='key') {
 if(existsSync('/key/key'))throw Error('Refusing key replacement');
 writeFileSync('/key/key',randomBytes(32),{mode:0o444});
} else {
 const key=readFileSync('/key/key');assert.equal(key.length,32);
 const decrypt=(bytes,k=key)=>{
  assert(bytes.subarray(0,8).equals(Buffer.from('GCBACK01')),'Unknown archive format');
  const d=createDecipheriv('aes-256-gcm',k,bytes.subarray(8,20));d.setAAD(aad);d.setAuthTag(bytes.subarray(20,36));
  return Buffer.concat([d.update(bytes.subarray(36)),d.final()]);
 };
 if(mode==='encrypt') {
  assert(statSync('/snapshot/bundle.tar').size<256*1024*1024,'Bounded fixture archive required');
  // Save the nonce independently; each archive uses a fresh 96-bit nonce.
  const nonce=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(aad);
  const encrypted=Buffer.concat([cipher.update(readFileSync('/snapshot/bundle.tar')),cipher.final()]);
  writeFileSync('/encrypted/backup.gcb',Buffer.concat([Buffer.from('GCBACK01'),nonce,cipher.getAuthTag(),encrypted]));
  console.log('Authenticated encrypted provider/gateway archive created; key stored separately.');
 } else if(mode==='decrypt') {
  if(existsSync('/restored/bundle.tar'))throw Error('Fresh restore directory required');
  const bytes=readFileSync('/encrypted/backup.gcb');
  const tampered=Buffer.from(bytes);tampered[tampered.length-1]^=1;
  assert.throws(()=>decrypt(tampered));assert.throws(()=>decrypt(bytes,randomBytes(32)));
  const plain=decrypt(bytes); // Authenticate completely before writing/extracting anything.
  writeFileSync('/restored/bundle.tmp',plain);renameSync('/restored/bundle.tmp','/restored/bundle.tar');
  console.log('Wrong-key and tampered archives denied; authenticated archive recovered.');
 } else throw Error('Unknown archive action');
}
