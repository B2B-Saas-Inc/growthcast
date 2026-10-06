import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,statSync,existsSync,rmSync} from 'node:fs';
import {deliverConnections,validateConnection} from './deliver.mjs';
const service=process.getuid()===1000?'atrium':'documenso',role=service==='atrium'?'gc_app':'gc_documenso';
const ref='saedetvoolpdysiyjwvg';
const value={schemaVersion:1,service,projectRef:ref,databaseUrl:`postgresql://${role}.${ref}:${'a'.repeat(64)}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,databaseCa:readFileSync('/ca.crt','utf8')};
if(service==='atrium')value.storage={projectRef:ref,bucket:'gc-atrium-private',subject:'1ee8ab05-20bc-45de-97ed-82a010087cd8',email:'portal-storage@growthcast.invalid',publishableKey:'sb_publishable_synthetic',password:'b'.repeat(64)};
test('connection payload refuses elevated identities and configuration substitution',()=>{
 assert.equal(validateConnection(value,service),value);
 for(const mutation of [{schemaVersion:2},{service:'wrong'},{projectRef:'abcdefghijklmnopqrst'},{databaseCa:'wrong'},{databaseUrl:value.databaseUrl.replace(role,'postgres')},{databaseUrl:value.databaseUrl+'?sslmode=disable'},{ownerPassword:'unexpected'}])assert.throws(()=>validateConnection({...value,...mutation},service));
 if(service==='atrium')for(const mutation of [{bucket:'another-bucket'},{subject:'465b0e94-dce5-4102-9d83-437a6465b4c5'},{publishableKey:'service-role'},{adminKey:'unexpected'}])assert.throws(()=>validateConnection({...value,storage:{...value.storage,...mutation}},service));
});
test('connection delivery pins response, preserves occupied targets and removes private files',async()=>{
 const root=mkdtempSync('/tmp/connections-'),directory=root+'/material',storageDirectory=root+'/storage';mkdirSync(storageDirectory,{mode:0o700});
 const pin={arn:'synthetic-own-secret',version:'synthetic-version'},env={AWS_CONTAINER_CREDENTIALS_RELATIVE_URI:'/v2/credentials/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'};
 const response={ARN:pin.arn,VersionId:pin.version,SecretString:JSON.stringify(value)};
 const client={send:async command=>{assert.deepEqual(command.input,{SecretId:pin.arn,VersionId:pin.version});return response;}};
 const args={service,directory,storageDirectory,pin,env,client};
 try {
  await assert.rejects(deliverConnections({...args,client:{send:async()=>({...response,ARN:'another-secret'})}}));assert(!existsSync(directory));
  await assert.rejects(deliverConnections({...args,client:{send:async()=>({...response,VersionId:'another-version'})}}));assert(!existsSync(directory));
  const delivered=await deliverConnections(args);
  for(const file of ['database-url','database-ca.crt']){const stat=statSync(directory+'/'+file);assert.equal(stat.uid,process.getuid());assert.equal(stat.mode&0o777,0o400);}
  assert.equal(readFileSync(directory+'/database-url','utf8'),value.databaseUrl);
  if(service==='atrium'){assert.equal(statSync(storageDirectory+'/credentials.json').mode&0o777,0o400);assert.deepEqual(JSON.parse(readFileSync(storageDirectory+'/credentials.json','utf8')),value.storage);}
  await assert.rejects(deliverConnections(args));assert.equal(readFileSync(directory+'/database-url','utf8'),value.databaseUrl);
  delivered.cleanup();assert(!existsSync(directory));assert(!existsSync(storageDirectory+'/credentials.json'));
 }finally{rmSync(root,{recursive:true,force:true});}
});
