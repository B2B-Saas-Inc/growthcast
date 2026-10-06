/* eslint-disable @typescript-eslint/no-require-imports -- Tests compiled storage package. */
const assert = require('node:assert/strict');
const {LocalStorage} = require('/upstream/apps/api/dist/files/storage/local.storage.js');
(async () => {
  const storage = new LocalStorage({get:()=>'/tmp/private-storage'});
  for (const key of ['../private-storage-neighbor/escape','../outside','/tmp/private-storage/file','', 'nested\\escape','bad\0key']) {
    await assert.rejects(()=>storage.upload(key,Buffer.from('synthetic'),'text/plain'),/Path traversal/);
    await assert.rejects(()=>storage.download(key),/Path traversal/);
    await assert.rejects(()=>storage.delete(key),/Path traversal/);
  }
  await storage.upload('organization/project/file',Buffer.from('synthetic'),'text/plain');
  const {body} = await storage.download('organization/project/file');
  const chunks = []; for await (const chunk of body) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString(),'synthetic');
  await storage.delete('organization/project/file');
  console.log('Compiled local storage denies sibling-prefix/traversal keys and preserves normal artifact access.');
})();
