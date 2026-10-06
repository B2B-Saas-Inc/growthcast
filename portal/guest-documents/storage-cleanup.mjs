import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {StorageClient} from '/foundation/storage/client.mjs';
const c=JSON.parse(readFileSync('/connector/storage.json'));
assert.equal(c.projectRef,'saedetvoolpdysiyjwvg');assert.equal(c.bucket,'gc-atrium-private');assert.match(c.testKey,/^guest-connector-test\/[a-f0-9-]{36}\.pdf$/);
const storage=new StorageClient({projectRef:c.projectRef,bucket:c.bucket,credentials:c});await storage.delete(c.testKey);await assert.rejects(()=>storage.download(c.testKey));console.log('Exact synthetic staging object cleanup verified.');
