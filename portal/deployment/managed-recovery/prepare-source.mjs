// Synthetic fixture setup is separate from the read-only backup process.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {StorageClient} from '../storage/client.mjs';
const credentials=JSON.parse(readFileSync('/source/storage-credentials.json','utf8'));
const projectRef='saedetvoolpdysiyjwvg',bucket='gc-atrium-private';
assert.equal(credentials.projectRef,projectRef);assert.equal(credentials.bucket,bucket);
const storage=new StorageClient({projectRef,bucket,credentials});
try {
  const response=await storage.call('/storage/v1/object/list/'+bucket,{method:'POST',headers:{...await storage.headers(),'content-type':'application/json'},body:JSON.stringify({prefix:'',limit:1})});
  assert.equal(response.ok,true);assert.deepEqual(await response.json(),[],'Bounded empty staging bucket required');
  const key='recovery/'+randomUUID()+'.txt';
  writeFileSync('/journal/object.json',JSON.stringify({key}),{mode:0o600,flag:'wx'});
  await storage.upload(key,Buffer.from('Synthetic live Supabase recovery artifact.\n'),'text/plain');
  console.log('Scoped fixture writer prepared the journaled synthetic object.');
} catch {console.error('Source fixture preparation failed; sensitive diagnostics withheld');process.exitCode=1;}
