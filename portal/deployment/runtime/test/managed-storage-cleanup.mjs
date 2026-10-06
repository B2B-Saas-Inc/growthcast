import {existsSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {StorageClient} from '/boundary/deployment/storage/client.mjs';
// Intent is recorded before upload, allowing cleanup even if DB insertion or HTTP response fails.
if (!existsSync('/evidence/storage-cleanup.json')) {
  console.log('No managed upload was attempted.');
} else {
  const {filename} = JSON.parse(readFileSync('/evidence/storage-cleanup.json','utf8'));
  assert.match(filename,/^private-fixture-[a-f0-9-]{36}\.txt$/);
  const credentials = JSON.parse(readFileSync('/run/storage/credentials.json','utf8'));
  assert.equal(credentials.projectRef,'saedetvoolpdysiyjwvg');
  assert.equal(credentials.bucket,'gc-atrium-private');
  const client = new StorageClient({...credentials,credentials});
  const list = async () => {
    const response = await client.call('/storage/v1/object/list/'+client.bucket,{method:'POST',
      headers:{...await client.headers(),'content-type':'application/json'},
      body:JSON.stringify({prefix:'runtime-org/runtime-project',limit:100})});
    assert.equal(response.status,200);
    const objects = await response.json();
    assert.ok(Array.isArray(objects) && objects.length < 100);
    const matching = objects.filter(object=>object.name?.endsWith('-'+filename));
    for (const object of matching) {
      assert.ok(object.id && /^[a-f0-9-]{36}-/.test(object.name) && object.name.endsWith('-'+filename) && !object.name.includes('/'));
    }
    return matching;
  };
  const objects = await list();
  if (existsSync('/evidence/storage.json')) {
    const {storageKey} = JSON.parse(readFileSync('/evidence/storage.json','utf8'));
    assert.equal(objects.length,1,'Successful upload must exist before cleanup');
    assert.equal('runtime-org/runtime-project/'+objects[0].name,storageKey);
  }
  for (const object of objects) await client.delete('runtime-org/runtime-project/'+object.name);
  assert.equal((await list()).length,0);
  console.log(`Managed storage cleanup verified: ${objects.length} uniquely named synthetic object(s) removed.`);
}
