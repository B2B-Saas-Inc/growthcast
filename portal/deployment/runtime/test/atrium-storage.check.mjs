import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
const mode = process.argv[2];
const cookies = new Map(JSON.parse(readFileSync('/evidence/session.json','utf8')).cookies);
const proof = readFileSync('/run/origin/api-origin','utf8').trim();
const bytes = 'Synthetic private artifact: persistence and authorization.\n';
const request = (path,options={}) => fetch('http://provider:3001'+path, {redirect:'manual',signal:AbortSignal.timeout(10000),...options,
  headers:{'x-growthcast-origin':proof,Origin:'https://portal.growthcast.invalid',
    Cookie:[...cookies].map(([key,value])=>`${key}=${value}`).join('; '),
    'x-csrf-token':cookies.get('csrf-token'),...options.headers}});
let id;
if (mode === 'upload') {
  const filename = `private-fixture-${randomUUID()}.txt`;
  writeFileSync('/evidence/storage-cleanup.json',JSON.stringify({filename}),{mode:0o644});
  const form = new FormData(); form.set('file',new Blob([bytes],{type:'text/plain'}),filename);
  const response = await request('/api/files/upload/mine?projectId=runtime-project',{method:'POST',body:form});
  assert.equal(response.status,201);
  const uploaded = await response.json(); id = uploaded.id; assert.equal(typeof id,'string');
  writeFileSync('/evidence/storage.json',JSON.stringify({id,storageKey:uploaded.storageKey}),{mode:0o644});
} else { id = JSON.parse(readFileSync('/evidence/storage.json','utf8')).id; }
const response = await request(`/api/files/${id}/download`);
if (mode === 'denied') {
  assert.equal(response.status,403);
  assert.equal((await request(`/api/files/${id}/download`,{method:'HEAD'})).status,403);
  assert.equal((await request(`/api/files/${id}/download`,{headers:{Range:'bytes=0-8'}})).status,403);
  assert.equal((await request(`/api/files/${id}/url`)).status,403);
  console.log('Removing project membership denies the existing file and download URL.');
} else {
  assert.equal(response.status,200); assert.equal(await response.text(),bytes);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.deepEqual(await (await request(`/api/files/${id}/url`)).json(),{url:`/api/files/${id}/download`});
  for (const method of ['GET','HEAD']) {
    assert.equal((await request(`/api/files/${id}/download`,{method,headers:{Cookie:'',Range:'bytes=0-8'}})).status,401);
  }
  assert.equal((await request('/api/files/runtime-unassigned-file/download')).status,403);
  assert.equal((await request('/api/files/runtime-other-file/download')).status,404);
  const raw = await fetch(`http://provider:3001/api/files/${id}/download`,{headers:{Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}});
  assert.equal(raw.status,403,'A valid account session must not bypass origin proof');
  console.log(mode === 'upload' ? 'Private upload, authorized download and anonymous/cross-project/cross-organization denials passed.' : 'Private file bytes and account authorization survived API container recreation.');
}
