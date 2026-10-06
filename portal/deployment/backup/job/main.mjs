import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fromContainerMetadata} from '@aws-sdk/credential-providers';
import {S3Client,PutObjectCommand} from '@aws-sdk/client-s3';
import {KMSClient,EncryptCommand} from '@aws-sdk/client-kms';
import {SecretsManagerClient,GetSecretValueCommand} from '@aws-sdk/client-secrets-manager';
import {CloudWatchClient,PutMetricDataCommand} from '@aws-sdk/client-cloudwatch';
import {runJob} from './core.mjs';
process.umask(0o077);
try {
  assert.ok(process.getuid()!==0,'Non-root job required');
  assert.match(process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI??'',/^\/v2\/credentials\/[a-f0-9-]{36}$/);
  for(const name of ['AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN','AWS_PROFILE','AWS_CONTAINER_CREDENTIALS_FULL_URI'])assert.ok(!process.env[name],'ECS task credentials required');
  const config=JSON.parse(readFileSync(new URL('./configuration.json',import.meta.url),'utf8'));
  const options={region:'us-east-1',credentials:fromContainerMetadata({timeout:3000,maxRetries:2}),maxAttempts:3};
  const s3=new S3Client(options),kms=new KMSClient(options),secrets=new SecretsManagerClient(options),metrics=new CloudWatchClient(options);
  const abortSignal=AbortSignal.timeout(25*60*1000);
  const aws={
    secret:SecretId=>secrets.send(new GetSecretValueCommand({SecretId}),{abortSignal}),
    wrap:(KeyId,Plaintext,EncryptionContext)=>kms.send(new EncryptCommand({KeyId,Plaintext,EncryptionContext}),{abortSignal}),
    put:async(Bucket,Key,Body)=>(await s3.send(new PutObjectCommand({Bucket,Key,Body,IfNoneMatch:'*',ServerSideEncryption:'AES256'}),{abortSignal})).VersionId,
    metric:(MetricName,Value)=>metrics.send(new PutMetricDataCommand({Namespace:'GrowthCast/PortalRecovery',MetricData:[{MetricName,Value,Unit:'Count',Dimensions:[{Name:'Environment',Value:'staging'}]}]}),{abortSignal:AbortSignal.timeout(15000)})
  };
  await runJob({aws,config,work:'/work',capture:async({source,snapshot})=>{
    const {stdout}=await promisify(execFile)(process.execPath,['/app/deployment/backup/capture.mjs'],{env:{PATH:process.env.PATH,PORTAL_CAPTURE_SOURCE:source,PORTAL_CAPTURE_DIRECTORY:snapshot},timeout:20*60*1000,maxBuffer:65536});
    const result=JSON.parse(stdout.trim());assert.equal(result.stage,'CAPTURED');
    return {tables:result.tables,rows:result.rows,objects:result.objects,objectBytes:result.objectBytes};
  }});
} catch {console.error('Backup task failed; sensitive diagnostics withheld');process.exitCode=1;}
