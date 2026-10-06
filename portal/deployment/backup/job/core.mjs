import assert from 'node:assert/strict';
import {mkdirSync,readdirSync,readFileSync,writeFileSync,rmSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID,randomBytes,createCipheriv,createHash} from 'node:crypto';
export const projectRef='saedetvoolpdysiyjwvg';
export function validateSecret(value) {
  assert.equal(value.schemaVersion,2);assert.equal(value.projectRef,projectRef);assert.equal(value.role,'gc_backup');
  const url=new URL(value.databaseUrl);
  assert.ok(['postgres:','postgresql:'].includes(url.protocol));assert.equal(decodeURIComponent(url.username),'gc_backup.'+projectRef);
  assert.equal(url.hostname,'aws-0-us-east-1.pooler.supabase.com');assert.equal(url.port,'5432');assert.equal(url.pathname,'/postgres');assert.ok(url.password);
  assert.equal(createHash('sha256').update(value.databaseCaCert).digest('hex'),'700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7');
  const storage=value.storageCredentials;
  assert.equal(storage.projectRef,projectRef);assert.equal(storage.bucket,'gc-atrium-private');assert.equal(storage.email,'portal-backup-storage@growthcast.invalid');
  assert.equal(storage.subject,'465b0e94-dce5-4102-9d83-437a6465b4c5');
  assert.ok(storage.publishableKey.startsWith('sb_publishable_'));assert.ok(typeof storage.password==='string' && storage.password.length>=32);
  return value;
}
export async function runJob({aws,capture,config,work,log=console.log,validate=validateSecret}) {
  assert.deepEqual(readdirSync(work),[],'Fresh job work directory required');
  const runId=new Date().toISOString().replace(/[-:.]/g,'')+'-'+randomUUID();
  const prefix='staging/'+runId+'/',archiveKey=prefix+'backup.gcb';
  let stage='STARTED',key;
  const event=(state,extra={})=>log(JSON.stringify({runId,stage:state,...extra}));
  try {
    event(stage);
    const raw=await aws.secret(config.secretArn);const secret=validate(JSON.parse(raw.SecretString));
    const source=join(work,'source'),snapshot=join(work,'snapshot');mkdirSync(source,{mode:0o700});mkdirSync(snapshot,{mode:0o700});
    for(const [name,value] of [['database-url',secret.databaseUrl],['prod-ca-2021.crt',secret.databaseCaCert],['storage-credentials.json',JSON.stringify(secret.storageCredentials)]])writeFileSync(join(source,name),value,{mode:0o600,flag:'wx'});
    stage='CAPTURE';const counts=await capture({source,snapshot});
    assert.ok(['tables','rows','objects','objectBytes'].every(name=>Number.isSafeInteger(counts[name]) && counts[name]>=0));event('CAPTURED',counts);
    const path=join(snapshot,'bundle.tar');assert.ok(statSync(path).size<256*1024*1024);
    stage='ENCRYPT';key=randomBytes(32);const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);
    cipher.setAAD(Buffer.from('GrowthCast recovery archive v1'));
    const bytes=Buffer.concat([cipher.update(readFileSync(path)),cipher.final()]);
    const encrypted=Buffer.concat([Buffer.from('GCBACK01'),nonce,cipher.getAuthTag(),bytes]);
    const context={project:'growthcast-portal-staging',archive:archiveKey};
    const wrapped=await aws.wrap(config.keyArn,key,context);assert.equal(wrapped.KeyId,config.keyArn);assert.ok(wrapped.CiphertextBlob?.length);
    const envelope={schemaVersion:1,keyArn:config.keyArn,context,ciphertext:Buffer.from(wrapped.CiphertextBlob).toString('base64')};
    stage='UPLOAD_ENVELOPE';const envelopeVersion=await aws.put(config.bucket,prefix+'key.kms.json',Buffer.from(JSON.stringify(envelope)));
    assert.ok(typeof envelopeVersion==='string' && envelopeVersion!=='null' && envelopeVersion.length>0);
    stage='UPLOAD_ARCHIVE';const version=await aws.put(config.bucket,archiveKey,encrypted);
    assert.ok(typeof version==='string' && version!=='null' && version.length>0);
    const receipt={schemaVersion:1,runId,stage:'UPLOADED',verification:'pending-independent-restore',checkedAt:new Date().toISOString(),
      bucket:config.bucket,key:archiveKey,versionId:version,sha256:createHash('sha256').update(encrypted).digest('hex'),bytes:encrypted.length,
      managedKey:{keyArn:config.keyArn,objectKey:prefix+'key.kms.json',versionId:envelopeVersion},sourceSecretVersion:raw.VersionId,...counts};
    stage='UPLOAD_RECEIPT';const receiptVersion=await aws.put(config.bucket,prefix+'receipt.json',Buffer.from(JSON.stringify(receipt)));
    assert.ok(typeof receiptVersion==='string' && receiptVersion!=='null' && receiptVersion.length>0);
    stage='METRICS';await aws.metric('BackupUploadSucceeded',1);
    event('UPLOADED',{...counts,receiptKey:prefix+'receipt.json',receiptVersion,verification:'pending-independent-restore'});
    return receipt;
  } catch {
    let failureMetricRecorded=false;
    try {await aws.metric('BackupFailed',1);failureMetricRecorded=true;} catch { /* Independent freshness monitoring must cover unavailable metrics. */ }
    event('FAILED',{category:stage,failureMetricRecorded});throw Error('Backup job failed; sensitive diagnostics withheld');
  } finally {
    key?.fill(0);
    for(const name of readdirSync(work))rmSync(join(work,name),{recursive:true,force:true});
  }
}
