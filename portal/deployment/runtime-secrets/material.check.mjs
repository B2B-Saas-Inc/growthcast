import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,statSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {materialize,validateMaterial} from './material.mjs';
const atrium={schemaVersion:1,service:'atrium',secrets:{BETTER_AUTH_SECRET:'a'.repeat(64),PORTAL_API_ORIGIN:'b'.repeat(64)}};
test('reject cross-service, extra credentials, malformed and downgraded material',()=>{
 for(const bad of [{...atrium,service:'documenso'},{...atrium,schemaVersion:0},{...atrium,extra:'data'},{...atrium,secrets:{...atrium.secrets,DATABASE_URL:'admin'}},{...atrium,secrets:{...atrium.secrets,BETTER_AUTH_SECRET:'short'}}])assert.throws(()=>validateMaterial(bad,'atrium'));
 assert.throws(()=>validateMaterial(atrium,'__proto__'));
});
test('private material output is exclusive and invalid input cannot write partial files',()=>{
 const root=mkdtempSync(tmpdir()+'/gc-material-');const directory=root+'/material';
 try{
  assert.throws(()=>materialize({...atrium,schemaVersion:0},'atrium',directory));assert(!existsSync(directory));
  assert.deepEqual(materialize(atrium,'atrium',directory),{service:'atrium',files:2});
  assert.equal(statSync(directory).mode&0o777,0o700);
  for(const file of ['application-secret-env.json','api-origin'])assert.equal(statSync(directory+'/'+file).mode&0o777,0o400);
  assert.deepEqual(JSON.parse(readFileSync(directory+'/application-secret-env.json')),{BETTER_AUTH_SECRET:'a'.repeat(64)});
  assert.throws(()=>materialize(atrium,'atrium',directory));assert.equal(readFileSync(directory+'/api-origin','utf8'),'b'.repeat(64));
 }finally{rmSync(root,{recursive:true,force:true});}
});
