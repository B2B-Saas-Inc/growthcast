import assert from 'node:assert/strict';
import {writeFileSync,readdirSync,rmSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fromContainerMetadata} from '@aws-sdk/credential-providers';
import {S3Client,GetObjectCommand,PutObjectCommand} from '@aws-sdk/client-s3';
import {KMSClient,DecryptCommand} from '@aws-sdk/client-kms';
import {bucket,keyArn,receiptBinding,decryptArchive,recordFor} from './cloud-core.mjs';
process.umask(0o077);
let receipt,pointer,key,s3;
const signal=AbortSignal.timeout(20*60*1000);
async function get(Key,VersionId,limit) {
 const result=await s3.send(new GetObjectCommand({Bucket:bucket,Key,VersionId}),{abortSignal:signal});
 assert.equal(result.VersionId,VersionId);assert.ok(result.ContentLength>0 && result.ContentLength<=limit);
 const chunks=[];let size=0;for await(const chunk of result.Body){size+=chunk.length;assert.ok(size<=limit);chunks.push(chunk);}return Buffer.concat(chunks);
}
async function publish(state,counts) {
 const record=recordFor(receipt,pointer,state,counts),raw=Buffer.from(JSON.stringify(record));
 const objectKey='verification/staging/'+receipt.runId+'/'+record.evidenceSha256+'.json';
 const result=await s3.send(new PutObjectCommand({Bucket:bucket,Key:objectKey,Body:raw,IfNoneMatch:'*',ServerSideEncryption:'AES256'}),{abortSignal:signal});
 assert.ok(result.VersionId && result.VersionId!=='null');assert.deepEqual(await get(objectKey,result.VersionId,65536),raw);
 console.log(JSON.stringify({stage:state,runId:receipt.runId,recordKey:objectKey,recordVersion:result.VersionId,...(counts??{})}));
}
try {
 assert.notEqual(process.getuid(),0);
 assert.match(process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI??'',/^\/v2\/credentials\/[a-f0-9-]{36}$/);
 for(const name of ['AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN','AWS_PROFILE','AWS_CONTAINER_CREDENTIALS_FULL_URI'])assert.ok(!process.env[name]);
 assert.deepEqual(readdirSync('/input'),[]);
 pointer={key:process.env.RECEIPT_KEY,versionId:process.env.RECEIPT_VERSION};
 assert.match(pointer.key??'',/^staging\/[0-9TZ]+-[a-f0-9-]{36}\/receipt.json$/);assert.ok(pointer.versionId && pointer.versionId!=='null');
 const options={region:'us-east-1',credentials:fromContainerMetadata({timeout:3000,maxRetries:2}),maxAttempts:3};
 s3=new S3Client(options);const kms=new KMSClient(options);
 receipt=receiptBinding(JSON.parse((await get(pointer.key,pointer.versionId,65536)).toString()),pointer);
 const envelope=JSON.parse((await get(receipt.managedKey.objectKey,receipt.managedKey.versionId,65536)).toString());
 assert.equal(envelope.schemaVersion,1);assert.equal(envelope.keyArn,keyArn);assert.deepEqual(envelope.context,{project:'growthcast-portal-staging',archive:receipt.key});
 const recovered=await kms.send(new DecryptCommand({KeyId:keyArn,CiphertextBlob:Buffer.from(envelope.ciphertext,'base64'),EncryptionContext:envelope.context}),{abortSignal:signal});
 assert.equal(recovered.KeyId,keyArn);key=Buffer.from(recovered.Plaintext);recovered.Plaintext.fill(0);
 const archive=await get(receipt.key,receipt.versionId,257*1024*1024);
 const plain=decryptArchive(archive,key,receipt);key.fill(0);
 writeFileSync('/input/bundle.tar',plain,{mode:0o600,flag:'wx'});plain.fill(0);
 const {stdout}=await promisify(execFile)('sh',['/app/verify.sh'],{env:{PATH:process.env.PATH},timeout:12*60*1000,maxBuffer:65536});
 assert.ok(stdout.includes('Packaged isolated restore passed; target overwrite denied.'));
 const counts=JSON.parse(stdout.split('\n').find(line=>line.startsWith('{"verifiedTables"')));
 await publish('VERIFIED',counts);
} catch {
 if(receipt)try{await publish('FAILED');}catch{/* Missing verification remains unhealthy under the independent monitor. */}
 console.error('Restore worker failed; sensitive diagnostics withheld');process.exitCode=1;
} finally {
 key?.fill(0);
 for(const path of ['/input','/work','/restored','/objects'])for(const name of readdirSync(path))rmSync(path+'/'+name,{recursive:true,force:true});
}
