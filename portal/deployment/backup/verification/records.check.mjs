import test from 'node:test';import assert from 'node:assert/strict';
import {backupTime,evaluate} from './records.mjs';
const now=Date.parse('2026-09-24T15:00:00Z');
function record(run='20260924T130000000Z-11111111-1111-4111-8111-111111111111',state='VERIFIED',checkedAt='2026-09-24T14:00:00Z') {
 return {schemaVersion:1,environment:'staging',runId:run,state,checkedAt,backupAt:backupTime(run),scope:'isolated-local-database-and-object-restore',archive:{bucket:'growthcast-portal-staging-recovery-059393269249',key:'staging/'+run+'/backup.gcb',versionId:'v1',sha256:'a'.repeat(64)},uploadReceipt:{key:'staging/'+run+'/receipt.json',versionId:'r1'},evidenceSha256:'b'.repeat(64)};
}
test('fresh verified source backup is healthy',()=>assert.deepEqual(evaluate([record()],now),{healthy:true,reason:'verified-backup-fresh',ageHours:2}));
test('missing and upload-only receipts cannot establish health',()=>{assert.equal(evaluate([],now).healthy,false);assert.equal(evaluate([{...record(),state:'UPLOADED'}],now).healthy,false);});
test('restoring old data now does not reset source freshness',()=>assert.equal(evaluate([record('20260922T130000000Z-11111111-1111-4111-8111-111111111111')],now).reason,'stale-backup'));
test('newer restore failure remains unhealthy despite another upload or old successful restore',()=>assert.equal(evaluate([record(),record('20260924T140000000Z-22222222-2222-4222-8222-222222222222','FAILED','2026-09-24T14:30:00Z')],now).reason,'unresolved-restore-failure'));
test('later successful verification resolves that run failure',()=>assert.equal(evaluate([record(undefined,'FAILED'),record(undefined,'VERIFIED','2026-09-24T14:30:00Z')],now).healthy,true));
test('invalid timestamp, source binding and null version fail closed',()=>{
 for(const mutate of [r=>r.backupAt='2026-09-24T15:00:00Z',r=>r.checkedAt='2026-09-25T00:00:00Z',r=>r.archive.versionId='null',r=>r.archive.key='staging/other/backup.gcb']){const r=record();mutate(r);assert.equal(evaluate([r],now).reason,'invalid-verification-record');}
});
