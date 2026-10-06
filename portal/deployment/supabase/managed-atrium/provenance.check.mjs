import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {files} from './migrate.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const historical=new URL('../../../foundation/',import.meta.url);
test('managed baseline preserves source checksums and changes only the explicit namespace',async()=>{
 const raw=readFileSync(new URL('migrations/manifest.json',historical));
 const source=JSON.parse(raw),managed=JSON.parse(readFileSync(new URL('./migrations/manifest.json',import.meta.url)));
 assert.equal(sha(raw),managed.sourceManifestSha256);
 assert.equal(managed.atriumRevision,source.atriumRevision);
 const entries=await files();assert.equal(entries.length,9);
 for(const [i,entry] of source.migrations.entries()) {
  const sql=readFileSync(new URL('migrations/'+entry.name,historical),'utf8');
  assert.equal(sha(sql),entry.sha256);assert.equal(managed.migrations[i].sourceSha256,entry.sha256);
  const derived=sql.replace(/\bpublic\b/g,'gc_atrium').replace('-- CreateSchema\nCREATE SCHEMA IF NOT EXISTS "gc_atrium";\n','-- Schema is pre-provisioned by the administrator; migration role cannot create schemas.\n');
  assert.equal(entries[i].sql,derived);
 }
});
