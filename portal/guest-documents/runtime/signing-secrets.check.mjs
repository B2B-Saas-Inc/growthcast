import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync,statSync,readFileSync,writeFileSync} from 'node:fs';
import {signingSecrets} from './signing-secrets.mjs';
const pin={arn:'arn:aws:secretsmanager:us-east-1:059393269249:secret:growthcast/portal/staging/signing/gateway-example',version:'11111111-1111-4111-8111-111111111111',uid:1000};
const env={AWS_CONTAINER_CREDENTIALS_RELATIVE_URI:'/v2/credentials/11111111-1111-4111-8111-111111111111'};
test('version-pinned signing delivery creates private files and removes them on cleanup',async()=>{
 const directory=mkdtempSync('/tmp/signing-secret-');
 try{const material=await signingSecrets({kind:'gateway',pins:{gateway:pin},env,directory,client:{async send(command){assert.equal(command.input.VersionId,pin.version);return {ARN:pin.arn,VersionId:pin.version,SecretString:'{"synthetic":true}'};}}});
 assert.equal(statSync(directory+'/connection.json').mode&0o777,0o400);assert.deepEqual(JSON.parse(readFileSync(directory+'/connection.json')),{synthetic:true});material.cleanup();assert.equal(existsSync(directory+'/connection.json'),false);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
test('foreign credentials, wrong versions, and occupied files fail without exposing or overwriting values',async()=>{
 const directory=mkdtempSync('/tmp/signing-secret-');
 const options={kind:'gateway',pins:{gateway:pin},env,directory,client:{async send(){return {ARN:pin.arn,VersionId:pin.version,SecretString:'{"private":"value"}'};}}};
 try{
  await assert.rejects(()=>signingSecrets({...options,env:{...env,AWS_ACCESS_KEY_ID:'override'}}));
  await assert.rejects(()=>signingSecrets({...options,client:{async send(){return {ARN:pin.arn,VersionId:'wrong',SecretString:'private'};}}}),/Signing secret delivery refused/);
  writeFileSync(directory+'/connection.json','existing',{mode:0o400});await assert.rejects(()=>signingSecrets(options));assert.equal(readFileSync(directory+'/connection.json','utf8'),'existing');
 }finally{rmSync(directory,{recursive:true,force:true});}
});
test('partial lifecycle materialization removes only files created by this attempt',async()=>{
 const directory=mkdtempSync('/tmp/signing-secret-');
 try{writeFileSync(directory+'/signing-trust.pem','existing',{mode:0o400});
 await assert.rejects(()=>signingSecrets({kind:'lifecycle',pins:{lifecycle:pin},env,directory,client:{async send(){return {ARN:pin.arn,VersionId:pin.version,SecretString:JSON.stringify({config:{synthetic:true},trustPem:'-----BEGIN CERTIFICATE-----\nsynthetic'})};}}}));
 assert.equal(existsSync(directory+'/config.json'),false);assert.equal(readFileSync(directory+'/signing-trust.pem','utf8'),'existing');
 }finally{rmSync(directory,{recursive:true,force:true});}
});
