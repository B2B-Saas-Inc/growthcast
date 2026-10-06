import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,existsSync,rmSync,writeFileSync,chmodSync} from 'node:fs';
import {deliver,deliveryConfiguration} from './deliver.mjs';
import {applicationEnvironment} from '../runtime/secret-files.mjs';
const service=process.getuid()===1000?'atrium':'documenso';
const env={AWS_CONTAINER_CREDENTIALS_RELATIVE_URI:'/v2/credentials/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'};
test('task-only version-pinned delivery and private file consumption',async()=>{
 const root=mkdtempSync('/tmp/delivery-'),directory=root+'/material',originDirectory=root+'/origin';
 mkdirSync(originDirectory,{mode:0o700});
 const pin=deliveryConfiguration(service,env);
 const fields=service==='atrium'?['BETTER_AUTH_SECRET','PORTAL_API_ORIGIN']:['NEXTAUTH_SECRET','NEXT_PRIVATE_ENCRYPTION_KEY','NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY'];
 const secrets=Object.fromEntries(fields.map(key=>[key,'a'.repeat(64)]));
 const response={ARN:pin.arn,VersionId:pin.version,SecretString:JSON.stringify({schemaVersion:1,service,secrets})};
 const client={send:async command=>{assert.deepEqual(command.input,{SecretId:pin.arn,VersionId:pin.version});return response;}};
 try {
  for(const key of ['AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN','AWS_PROFILE','AWS_CONTAINER_CREDENTIALS_FULL_URI'])assert.throws(()=>deliveryConfiguration(service,{...env,[key]:'unexpected'}));
  assert.throws(()=>deliveryConfiguration(service,{}));assert.throws(()=>deliveryConfiguration(service,env,0));
  assert.throws(()=>deliveryConfiguration(service==='atrium'?'documenso':'atrium',env));
  await assert.rejects(deliver({service,env,directory,originDirectory,client:{send:async()=>({...response,VersionId:'wrong'})}}));assert(!existsSync(directory));
  await assert.rejects(deliver({service,env,directory,originDirectory,client:{send:async()=>{throw Error('synthetic denied');}}}));assert(!existsSync(directory));
  chmodSync(root,0o755);await assert.rejects(deliver({service,env,directory,originDirectory,client}));chmodSync(root,0o700);
  if(service==='atrium') {
   writeFileSync(originDirectory+'/api-origin','occupied',{mode:0o400});
   await assert.rejects(deliver({service,env,directory,originDirectory,client}));
   assert.equal(readFileSync(originDirectory+'/api-origin','utf8'),'occupied');assert(!existsSync(directory));rmSync(originDirectory+'/api-origin');
  }
  const result=await deliver({service,env,directory,originDirectory,client});
  if(service==='documenso')assert.deepEqual(applicationEnvironment({service,mode:'materialized',applicationEnv:{},directory}),secrets);
  else assert.equal(readFileSync(originDirectory+'/api-origin','utf8'),secrets.PORTAL_API_ORIGIN);
  await assert.rejects(deliver({service,env,directory,originDirectory,client}));
  result.cleanup();assert(!existsSync(directory));assert(!existsSync(originDirectory+'/api-origin'));
 }finally{rmSync(root,{recursive:true,force:true});}
});
