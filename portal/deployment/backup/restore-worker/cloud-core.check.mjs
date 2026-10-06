import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv,randomBytes} from 'node:crypto';
import {bucket,keyArn,sha,receiptBinding,decryptArchive,recordFor} from './cloud-core.mjs';
const runId='20260924T130357754Z-48664ebb-9af4-4cfe-9977-9907cd822d74';
const pointer={key:'staging/'+runId+'/receipt.json',versionId:'receipt-v1'};
function fixture(){
 const key=randomBytes(32),iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from('GrowthCast recovery archive v1'));
 const plain=Buffer.from('authenticated archive fixture'),encrypted=Buffer.concat([c.update(plain),c.final()]);
 const bytes=Buffer.concat([Buffer.from('GCBACK01'),iv,c.getAuthTag(),encrypted]);
 const receipt={schemaVersion:1,bucket,runId,stage:'UPLOADED',verification:'pending-independent-restore',key:'staging/'+runId+'/backup.gcb',versionId:'archive-v1',sha256:sha(bytes),bytes:bytes.length,managedKey:{keyArn,objectKey:'staging/'+runId+'/key.kms.json',versionId:'key-v1'},tables:107,rows:223,objects:3,objectBytes:2101};
 return {key,plain,bytes,receipt};
}
test('receipt and KMS pointer substitutions are rejected',()=>{
 const {receipt}=fixture();assert.equal(receiptBinding(receipt,pointer),receipt);
 for(const mutation of [r=>r.bucket='other',r=>r.key='staging/other/backup.gcb',r=>r.managedKey.keyArn='other',r=>r.managedKey.versionId='null',r=>r.rows=-1]){const bad=structuredClone(receipt);mutation(bad);assert.throws(()=>receiptBinding(bad,pointer));}
 assert.throws(()=>receiptBinding(receipt,{...pointer,key:'staging/other/receipt.json'}));
});
test('authenticated decryption rejects corruption even with substituted hash',()=>{
 const {receipt,key,plain,bytes}=fixture();assert.deepEqual(decryptArchive(bytes,key,receipt),plain);
 const bad=Buffer.from(bytes);bad[bad.length-1]^=1;assert.throws(()=>decryptArchive(bad,key,receipt));assert.throws(()=>decryptArchive(bad,key,{...receipt,sha256:sha(bad)}));assert.throws(()=>decryptArchive(bytes,randomBytes(32),receipt));
});
test('verification cannot be published for mismatched restored counts',()=>{
 const {receipt}=fixture();const counts={verifiedTables:107,verifiedRows:223,verifiedObjects:3,objectBytes:2101};
 assert.equal(recordFor(receipt,pointer,'VERIFIED',counts).state,'VERIFIED');
 for(const k of Object.keys(counts))assert.throws(()=>recordFor(receipt,pointer,'VERIFIED',{...counts,[k]:0}));
 assert.equal(recordFor(receipt,pointer,'FAILED').state,'FAILED');
});
