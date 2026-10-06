import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,existsSync,rmSync} from 'node:fs';
import {SecretsManagerClient,GetSecretValueCommand} from '@aws-sdk/client-secrets-manager';
import {fromContainerMetadata} from '@aws-sdk/credential-providers';
import {deliveryConfiguration} from '../runtime-secrets/deliver.mjs';
import {runtimeConfig} from '../runtime/config.mjs';
export function validateConnection(value,service) {
 assert(['atrium','documenso'].includes(service));
 assert.deepEqual(Object.keys(value).sort(),['schemaVersion','service','projectRef','databaseUrl','databaseCa',...(service==='atrium'?['storage']:[])].sort());
 assert.equal(value.schemaVersion,1);assert.equal(value.service,service);assert.equal(value.projectRef,'saedetvoolpdysiyjwvg');
 assert.equal(createHash('sha256').update(value.databaseCa).digest('hex'),'700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7');
 const url=new URL(value.databaseUrl);assert.match(url.password,/^[a-f0-9]{64}$/);assert.equal(url.search,'');
 runtimeConfig({service,url:value.databaseUrl,projectRef:value.projectRef,ca:value.databaseCa,caPath:'/run/connections/material/database-ca.crt'});
 if(service==='atrium') {
  assert.deepEqual(Object.keys(value.storage).sort(),['bucket','email','password','projectRef','publishableKey','subject']);
  assert.equal(value.storage.projectRef,value.projectRef);assert.equal(value.storage.bucket,'gc-atrium-private');
  assert.equal(value.storage.subject,'1ee8ab05-20bc-45de-97ed-82a010087cd8');
  assert.equal(value.storage.email,'portal-storage@growthcast.invalid');
  assert.match(value.storage.publishableKey,/^sb_publishable_[A-Za-z0-9_-]+$/);assert(typeof value.storage.password==='string' && value.storage.password.length>=32);
 }
 return value;
}
export async function deliverConnections({service,env=process.env,uid=process.getuid(),directory='/run/connections/material',storageDirectory='/run/storage',client,pin=JSON.parse(readFileSync(new URL('./pins.json',import.meta.url),'utf8'))[service]}) {
 deliveryConfiguration(service,env,uid);
 const parent=lstatSync(directory.slice(0,directory.lastIndexOf('/')));
 assert(parent.isDirectory() && parent.uid===uid && (parent.mode&0o777)===0o700 && !existsSync(directory));
 if(service==='atrium') {const stat=lstatSync(storageDirectory);assert(stat.isDirectory()&&stat.uid===uid&&(stat.mode&0o777)===0o700&&!existsSync(storageDirectory+'/credentials.json'));}
 const own=client??new SecretsManagerClient({region:'us-east-1',endpoint:'https://secretsmanager.us-east-1.amazonaws.com',maxAttempts:3,credentials:fromContainerMetadata({timeout:2000,maxRetries:2})});
 let created=false,storageCreated=false;
 const cleanup=()=>{if(storageCreated)rmSync(storageDirectory+'/credentials.json',{force:true});if(created)rmSync(directory,{recursive:true,force:true});};
 try {
  const response=await own.send(new GetSecretValueCommand({SecretId:pin.arn,VersionId:pin.version}));
  assert.equal(response.ARN,pin.arn);assert.equal(response.VersionId,pin.version);
  const value=validateConnection(JSON.parse(response.SecretString),service);
  mkdirSync(directory,{mode:0o700});created=true;
  writeFileSync(directory+'/database-url',value.databaseUrl,{flag:'wx',mode:0o400});
  writeFileSync(directory+'/database-ca.crt',value.databaseCa,{flag:'wx',mode:0o400});
  if(service==='atrium'){writeFileSync(storageDirectory+'/credentials.json',JSON.stringify(value.storage),{flag:'wx',mode:0o400});storageCreated=true;}
  return {directory,cleanup};
 }catch{cleanup();throw Error('Runtime connection delivery refused');}
 finally{if(!client)own.destroy();}
}
