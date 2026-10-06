import {existsSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {StorageClient} from '../storage/client.mjs';
if (existsSync('/journal/object.json')) {
  const {key}=JSON.parse(readFileSync('/journal/object.json','utf8'));
  assert.match(key,/^recovery\/[a-f0-9-]{36}\.txt$/);
  const credentials=JSON.parse(readFileSync('/source/storage-credentials.json','utf8'));
  assert.equal(credentials.projectRef,'saedetvoolpdysiyjwvg');assert.equal(credentials.bucket,'gc-atrium-private');
  const storage=new StorageClient({...credentials,credentials});
  await storage.delete(key);
  const response=await storage.call('/storage/v1/object/list/'+storage.bucket,{method:'POST',headers:{...await storage.headers(),'content-type':'application/json'},body:JSON.stringify({prefix:'recovery',limit:100})});
  assert.equal(response.status,200);const rows=await response.json();assert.ok(rows.length<100);
  assert.ok(!rows.some(row=>'recovery/'+row.name===key));
  console.log('Exact synthetic source object removed and absence verified.');
}
