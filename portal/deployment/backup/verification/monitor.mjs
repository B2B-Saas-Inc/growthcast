import assert from 'node:assert/strict';
import {fromContainerMetadata} from '@aws-sdk/credential-providers';
import {S3Client,ListObjectsV2Command,GetObjectCommand} from '@aws-sdk/client-s3';
import {CloudWatchClient,PutMetricDataCommand} from '@aws-sdk/client-cloudwatch';
import {evaluate,prefix} from './records.mjs';
try {
  assert.equal(process.getuid(),10001);
  assert.match(process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI??'',/^\/v2\/credentials\/[a-f0-9-]{36}$/);
  for(const name of ['AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN','AWS_PROFILE','AWS_CONTAINER_CREDENTIALS_FULL_URI'])assert.ok(!process.env[name]);
  const options={region:'us-east-1',credentials:fromContainerMetadata({timeout:3000,maxRetries:2}),maxAttempts:2};
  const s3=new S3Client(options),cw=new CloudWatchClient(options);
  const abortSignal=AbortSignal.timeout(180000);let state;
  try {
    const Bucket='growthcast-portal-staging-recovery-059393269249';
    const list=await s3.send(new ListObjectsV2Command({Bucket,Prefix:prefix,MaxKeys:1000}),{abortSignal});
    assert.ok(!list.IsTruncated);const records=[];
    for(const entry of list.Contents??[]) {
      assert.ok(entry.Size<=65536 && entry.Key.startsWith(prefix) && entry.Key.endsWith('.json'));
      const object=await s3.send(new GetObjectCommand({Bucket,Key:entry.Key}),{abortSignal});
      const chunks=[];let size=0;
      for await(const chunk of object.Body) {size+=chunk.length;assert.ok(size<=65536);chunks.push(chunk);}
      records.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    }
    state=evaluate(records);
  } catch {state={healthy:false,reason:'monitor-read-or-validation-failure',ageHours:null};}
  const MetricData=[{MetricName:'RecoveryHealthy',Value:Number(state.healthy),Unit:'Count'},{MetricName:'RecoveryMonitorHeartbeat',Value:1,Unit:'Count'}];
  if(state.ageHours!==null)MetricData.push({MetricName:'VerifiedBackupAgeHours',Value:state.ageHours,Unit:'None'});
  for(const metric of MetricData)metric.Dimensions=[{Name:'Environment',Value:'staging'}];
  await cw.send(new PutMetricDataCommand({Namespace:'GrowthCast/PortalRecovery',MetricData}),{abortSignal:AbortSignal.timeout(15000)});
  console.log(JSON.stringify({stage:'MONITORED',...state}));
  s3.destroy();cw.destroy();
  if(!state.healthy)process.exitCode=1;
} catch {console.error('Recovery monitor failed; sensitive diagnostics withheld');process.exitCode=1;}
