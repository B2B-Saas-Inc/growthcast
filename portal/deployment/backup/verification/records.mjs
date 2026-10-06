import assert from 'node:assert/strict';
export const prefix='verification/staging/';
const runPattern=/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z-[a-f0-9-]{36}$/;
export function backupTime(runId) {
  const m=runId.match(runPattern);assert.ok(m,'Invalid backup run ID');
  const iso=`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7]}Z`;
  const time=Date.parse(iso);assert.ok(Number.isFinite(time));assert.equal(new Date(time).toISOString(),iso);return iso;
}
export function validate(record,now=Date.now()) {
  assert.equal(record.schemaVersion,1);assert.equal(record.environment,'staging');
  assert.ok(['VERIFIED','FAILED'].includes(record.state));assert.equal(record.backupAt,backupTime(record.runId));
  const verified=Date.parse(record.checkedAt),backup=Date.parse(record.backupAt);
  assert.ok(Number.isFinite(verified) && verified>=backup && verified<=now+300000 && backup<=now+300000,'Invalid timestamps');
  assert.equal(record.archive.bucket,'growthcast-portal-staging-recovery-059393269249');
  assert.equal(record.archive.key,'staging/'+record.runId+'/backup.gcb');
  assert.ok(typeof record.archive.versionId==='string' && record.archive.versionId && record.archive.versionId!=='null');
  assert.match(record.archive.sha256,/^[a-f0-9]{64}$/);assert.match(record.evidenceSha256,/^[a-f0-9]{64}$/);
  assert.equal(record.uploadReceipt.key,'staging/'+record.runId+'/receipt.json');
  assert.ok(typeof record.uploadReceipt.versionId==='string' && record.uploadReceipt.versionId && record.uploadReceipt.versionId!=='null');
  if(record.state==='VERIFIED')assert.equal(record.scope,'isolated-local-database-and-object-restore');
  return record;
}
export function evaluate(records,now=Date.now()) {
  assert.ok(Number.isFinite(now));
  try {
    assert.ok(records.length<=10000);
    records.forEach(record=>validate(record,now));
    const verified=records.filter(record=>record.state==='VERIFIED').sort((a,b)=>Date.parse(b.backupAt)-Date.parse(a.backupAt));
    if(!verified.length)return {healthy:false,reason:'no-verified-backup',ageHours:null};
    const latest=verified[0],ageHours=Math.max(0,(now-Date.parse(latest.backupAt))/3600000);
    // A newer failed restore stays unhealthy until a later verification of that or newer backup.
    const failed=records.some(record=>record.state==='FAILED' && Date.parse(record.backupAt)>=Date.parse(latest.backupAt) &&
      !verified.some(pass=>Date.parse(pass.backupAt)>=Date.parse(record.backupAt) && Date.parse(pass.checkedAt)>Date.parse(record.checkedAt)));
    return {healthy:!failed && ageHours<=30,reason:failed?'unresolved-restore-failure':ageHours>30?'stale-backup':'verified-backup-fresh',ageHours};
  } catch {return {healthy:false,reason:'invalid-verification-record',ageHours:null};}
}
if(process.argv[2]==='evaluate') {
  const {readFileSync}=await import('node:fs');
  console.log(JSON.stringify(evaluate(JSON.parse(readFileSync(0,'utf8')))));
}
if(process.argv[2]==='validate') {
  const {readFileSync}=await import('node:fs');
  console.log(JSON.stringify(validate(JSON.parse(readFileSync(0,'utf8')))));
}
