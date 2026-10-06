import probeAssert from 'node:assert/strict';
import {materialize} from './material.mjs';
// Appended to material.mjs for the one-off task; only bounded metadata is logged.
import {SecretsManagerClient,GetSecretValueCommand,PutSecretValueCommand} from '@aws-sdk/client-secrets-manager';
import {KMSClient,DecryptCommand} from '@aws-sdk/client-kms';
import {statSync,readFileSync,rmSync} from 'node:fs';
const client=new SecretsManagerClient({region:'us-east-1',maxAttempts:3});
const kms=new KMSClient({region:'us-east-1',maxAttempts:3});
const deny=async action=>probeAssert.rejects(action,e=>e.name==='AccessDeniedException'||e.name==='AccessDenied');
let operation='identity';
try {
 probeAssert.notEqual(process.getuid(),0);probeAssert(!process.env.AWS_ACCESS_KEY_ID&&!process.env.AWS_SECRET_ACCESS_KEY);
 const service=process.env.SERVICE, secretArns=JSON.parse(process.env.SECRET_ARNS), keyArns=JSON.parse(process.env.KEY_ARNS),canaries=JSON.parse(process.env.KEY_CANARIES);
 let denied=0;
 if(['atrium','documenso'].includes(service)){
  const own=secretArns[service],other=secretArns[service==='atrium'?'documenso':'atrium'];
  operation='read-own';
  const response=await client.send(new GetSecretValueCommand({SecretId:own,VersionId:process.env.SECRET_VERSION}));
  probeAssert.equal(response.ARN,own);probeAssert.equal(response.VersionId,process.env.SECRET_VERSION);
  operation='materialize';
  const value=JSON.parse(response.SecretString);const files=materialize(value,service,'/work/material');
  probeAssert.equal(statSync('/work/material').mode&0o777,0o700);
  probeAssert.equal(statSync('/work/material/application-secret-env.json').mode&0o777,0o400);
  const output=JSON.parse(readFileSync('/work/material/application-secret-env.json','utf8'));
  for(const [key,value] of Object.entries(output))probeAssert.equal(value,JSON.parse(response.SecretString).secrets[key]);
  if(service==='atrium'){probeAssert.equal(statSync('/work/material/api-origin').mode&0o777,0o400);probeAssert.equal(readFileSync('/work/material/api-origin','utf8'),value.secrets.PORTAL_API_ORIGIN);}
  operation='deny-other';await deny(()=>client.send(new GetSecretValueCommand({SecretId:other})));denied++;
  operation='deny-backup';await deny(()=>client.send(new GetSecretValueCommand({SecretId:process.env.BACKUP_SECRET_ARN})));denied++;
  operation='deny-write';await deny(()=>client.send(new PutSecretValueCommand({SecretId:own,SecretString:'forbidden-probe'})));denied++;
  operation='deny-direct-decrypt';await deny(()=>kms.send(new DecryptCommand({KeyId:keyArns[service],CiphertextBlob:Buffer.from(canaries[service],'base64'),EncryptionContext:{SecretARN:own}})));denied++;
  rmSync('/work/material',{recursive:true});
  console.log(JSON.stringify({stage:'VERIFIED',service,secretVersion:response.VersionId,materializedFiles:files.files,privatePermissions:true,taskRoleCredentials:true,plaintextRemoved:true,denied}));
 }else{
  probeAssert(['backup','restore'].includes(service));
  for(const app of ['atrium','documenso']){
   await deny(()=>client.send(new GetSecretValueCommand({SecretId:secretArns[app]})));denied++;
   operation='deny-direct-decrypt';await deny(()=>kms.send(new DecryptCommand({KeyId:keyArns[app],CiphertextBlob:Buffer.from(canaries[app],'base64'),EncryptionContext:{SecretARN:secretArns[app]}})));denied++;
  }
  console.log(JSON.stringify({stage:'VERIFIED',service,denied}));
 }
}catch(e){console.log(JSON.stringify({stage:'FAILED',operation,detail:/^[A-Za-z0-9_]{1,50}$/.test(e.code??'')?e.code:undefined,actual:/^[A-Za-z0-9_]{1,50}$/.test(e.actual?.name??'')?e.actual.name:undefined,code:/^[A-Za-z0-9_]{1,50}$/.test(e.name??'')?e.name:'Unknown'}));process.exitCode=1;}
