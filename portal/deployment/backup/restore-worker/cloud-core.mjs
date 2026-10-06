import assert from 'node:assert/strict';
import {createHash,createDecipheriv,randomBytes} from 'node:crypto';
import {backupTime,validate} from '../verification/records.mjs';
export const bucket='growthcast-portal-staging-recovery-059393269249';
export const keyArn='arn:aws:kms:us-east-1:059393269249:key/83f92d33-f73f-4f86-88aa-73613fedae11';
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function receiptBinding(receipt,pointer) {
 assert.equal(receipt.schemaVersion,1);assert.equal(receipt.bucket,bucket);assert.equal(receipt.stage,'UPLOADED');assert.equal(receipt.verification,'pending-independent-restore');
 assert.ok(Date.parse(backupTime(receipt.runId))<=Date.now()+300000);
 assert.equal(pointer.key,'staging/'+receipt.runId+'/receipt.json');assert.ok(pointer.versionId && pointer.versionId!=='null');
 assert.equal(receipt.key,'staging/'+receipt.runId+'/backup.gcb');assert.match(receipt.sha256,/^[a-f0-9]{64}$/);
 assert.ok(typeof receipt.versionId==='string' && receipt.versionId && receipt.versionId!=='null');
 assert.ok(Number.isSafeInteger(receipt.bytes) && receipt.bytes>36 && receipt.bytes<257*1024*1024);
 assert.equal(receipt.managedKey.keyArn,keyArn);assert.equal(receipt.managedKey.objectKey,'staging/'+receipt.runId+'/key.kms.json');
 assert.ok(typeof receipt.managedKey.versionId==='string' && receipt.managedKey.versionId && receipt.managedKey.versionId!=='null');
 for(const k of ['tables','rows','objects','objectBytes'])assert.ok(Number.isSafeInteger(receipt[k]) && receipt[k]>=0);
 return receipt;
}
export function decryptArchive(bytes,key,receipt) {
 assert.equal(key.length,32);assert.equal(bytes.length,receipt.bytes);assert.equal(sha(bytes),receipt.sha256);
 const decode=(b,k)=>{assert.ok(b.subarray(0,8).equals(Buffer.from('GCBACK01')));const d=createDecipheriv('aes-256-gcm',k,b.subarray(8,20));d.setAAD(Buffer.from('GrowthCast recovery archive v1'));d.setAuthTag(b.subarray(20,36));return Buffer.concat([d.update(b.subarray(36)),d.final()]);};
 const tampered=Buffer.from(bytes);tampered[tampered.length-1]^=1;
 assert.throws(()=>decode(tampered,key));assert.throws(()=>decode(bytes,randomBytes(32)));
 return decode(bytes,key);
}
export function recordFor(receipt,pointer,state,counts=null) {
 if(state==='VERIFIED')assert.deepEqual(counts,{verifiedTables:receipt.tables,verifiedRows:receipt.rows,verifiedObjects:receipt.objects,objectBytes:receipt.objectBytes});
 const evidence={state,counts,receipt,pointer,checkedAt:new Date().toISOString(),worker:'ecs-isolated-restore-v1'};
 return validate({schemaVersion:1,environment:'staging',state,runId:receipt.runId,backupAt:backupTime(receipt.runId),checkedAt:evidence.checkedAt,
  scope:'isolated-local-database-and-object-restore',archive:{bucket,key:receipt.key,versionId:receipt.versionId,sha256:receipt.sha256},managedKey:receipt.managedKey,uploadReceipt:pointer,evidenceSha256:sha(JSON.stringify(evidence))});
}
