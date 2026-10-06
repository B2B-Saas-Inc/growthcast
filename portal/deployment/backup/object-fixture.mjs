// Explicit acceptance fixture only. Never imported by the backup capture.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {StorageClient} from '../storage/client.mjs';
const credentials=JSON.parse(readFileSync('/writer/credentials.json','utf8'));
assert.equal(credentials.projectRef,'saedetvoolpdysiyjwvg');assert.equal(credentials.bucket,'gc-atrium-private');
const storage=new StorageClient({...credentials,credentials});
try {
  if(process.argv[2]==='prepare') {
    const response=await storage.call('/storage/v1/object/list/'+storage.bucket,{method:'POST',headers:{...await storage.headers(),'content-type':'application/json'},body:JSON.stringify({prefix:'',limit:1})});
    assert.equal(response.ok,true);assert.deepEqual(await response.json(),[],'Acceptance fixture requires empty staging bucket');
    const prefix='backup-check/'+randomUUID()+'/';
    const objects=[['one.txt',Buffer.from('All-object backup fixture.\n')],['nested/two.bin',Buffer.alloc(2048,41)],['nested/three.txt',Buffer.from('Third independent object.\n')]];
    writeFileSync('/journal/objects.json',JSON.stringify({keys:objects.map(([name])=>prefix+name)}),{mode:0o600,flag:'wx'});
    for(const [name,bytes] of objects)await storage.upload(prefix+name,bytes,'application/octet-stream');
    console.log('Three uniquely journaled synthetic objects prepared by separate fixture writer.');
  } else if(process.argv[2]==='cleanup') {
    if(existsSync('/journal/objects.json')) {
      const {keys}=JSON.parse(readFileSync('/journal/objects.json','utf8'));
      assert.equal(keys.length,3);assert.ok(keys.every(key=>/^backup-check\/[a-f0-9-]{36}\/(one\.txt|nested\/two\.bin|nested\/three\.txt)$/.test(key)));
      assert.equal(new Set(keys.map(key=>key.split('/')[1])).size,1);
      for(const key of keys) {await storage.delete(key);await assert.rejects(storage.download(key));}
    }
    console.log('Exact multi-object fixtures removed and absence verified.');
  } else throw Error('Unknown fixture operation');
} catch {console.error('Multi-object fixture operation failed; sensitive details withheld');process.exitCode=1;}
