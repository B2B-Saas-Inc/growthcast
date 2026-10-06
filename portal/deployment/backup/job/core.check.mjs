import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDecipheriv} from 'node:crypto';
import {runJob,validateSecret} from './core.mjs';
const secret={databaseUrl:'private-database-password',databaseCaCert:'public-ca',storageCredentials:{password:'private-storage-password'}};
async function fixture(run) {
  const work=mkdtempSync(join(tmpdir(),'job-test-')),objects=[],metrics=[],logs=[];let key;
  const config={bucket:'test-bucket',keyArn:'test-key',secretArn:'test-secret'};
  const aws={secret:async()=>({SecretString:JSON.stringify(secret),VersionId:'source-version'}),
    wrap:async(KeyId,Plaintext,context)=>{key=Buffer.from(Plaintext);assert.match(context.archive,/^staging\/.+\/backup.gcb$/);return {KeyId,CiphertextBlob:Buffer.from('wrapped')};},
    put:async(bucket,name,bytes)=>{objects.push({bucket,name,bytes});return 'version-'+objects.length;},metric:async(name)=>{metrics.push(name);}};
  const capture=async({source,snapshot})=>{assert.equal(readFileSync(join(source,'database-url'),'utf8'),secret.databaseUrl);writeFileSync(join(snapshot,'bundle.tar'),'test archive bytes');return {tables:2,rows:5,objects:3,objectBytes:12};};
  const execute=()=>runJob({aws,capture,config,work,validate:x=>x,log:line=>logs.push(line)});
  try {await run({aws,work,objects,metrics,logs,execute,getKey:()=>key});}
  finally {rmSync(work,{recursive:true,force:true});}
}
test('wraps and uploads compatible ciphertext, exact version receipt, bounded logs and clean source files',async()=>fixture(async f=>{
  const receipt=await f.execute();assert.equal(receipt.stage,'UPLOADED');assert.equal(receipt.verification,'pending-independent-restore');
  assert.equal(f.objects.length,3);assert.ok(f.objects[0].name.endsWith('key.kms.json'));assert.ok(f.objects[2].name.endsWith('receipt.json'));
  const bytes=f.objects[1].bytes;assert.equal(bytes.subarray(0,8).toString(),'GCBACK01');
  const decipher=createDecipheriv('aes-256-gcm',f.getKey(),bytes.subarray(8,20));decipher.setAAD(Buffer.from('GrowthCast recovery archive v1'));decipher.setAuthTag(bytes.subarray(20,36));
  assert.equal(Buffer.concat([decipher.update(bytes.subarray(36)),decipher.final()]).toString(),'test archive bytes');
  const saved=JSON.parse(f.objects[2].bytes);assert.equal(saved.versionId,'version-2');assert.equal(saved.managedKey.versionId,'version-1');
  assert.deepEqual(f.metrics,['BackupUploadSucceeded']);assert.deepEqual(readdirSync(f.work),[]);
  assert.ok(!f.logs.join('').includes('private-'));assert.ok(!f.logs.join('').includes('VERIFIED'));
}));
for(const operation of ['secret','wrap','put','metric'])test(operation+' failure emits failed status without secret diagnostics and cleans disk',async()=>fixture(async f=>{
  f.aws[operation]=async()=>{throw Error('private-upstream-response');};
  await assert.rejects(f.execute,/Backup job failed/);assert.deepEqual(readdirSync(f.work),[]);
  assert.ok(f.logs.some(line=>JSON.parse(line).stage==='FAILED'));assert.ok(!f.logs.join('').includes('private-'));
}));
test('receipt upload failure cannot report successful upload',async()=>fixture(async f=>{
  const put=f.aws.put;f.aws.put=async(...args)=>{if(args[1].endsWith('receipt.json'))throw Error('denied');return put(...args);};
  await assert.rejects(f.execute);assert.deepEqual(f.metrics,['BackupFailed']);assert.ok(!f.logs.some(line=>JSON.parse(line).stage==='UPLOADED'));
}));
test('unversioned archive upload is rejected',async()=>fixture(async f=>{
  f.aws.put=async()=> 'null';await assert.rejects(f.execute);assert.deepEqual(f.metrics,['BackupFailed']);
}));
test('administrator and old secret formats rejected',()=>{
  assert.throws(()=>validateSecret({schemaVersion:1}));
  assert.throws(()=>validateSecret({schemaVersion:2,projectRef:'saedetvoolpdysiyjwvg',role:'postgres'}));
});
