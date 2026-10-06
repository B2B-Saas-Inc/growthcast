/* eslint-disable @typescript-eslint/no-require-imports -- Runs in pinned upstream image. */
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const root='/managed',source='/app/packages/prisma';
const manifest=JSON.parse(fs.readFileSync(root+'/manifest.json'));
assert.equal(sha(fs.readFileSync(source+'/schema.prisma')),manifest.prismaSchemaSha256);
const legacy=JSON.parse(fs.readFileSync(root+'/recovery/legacy-v1/manifest.json'));
assert.deepEqual(legacy.migrations,manifest.migrations.slice(0,165),'Existing applied migration hashes must remain unchanged');
const upstream=manifest.migrations.filter(e=>e.sourceSha256);
assert.equal(fs.readdirSync(source+'/migrations').filter(n=>fs.existsSync(source+'/migrations/'+n+'/migration.sql')).length,upstream.length);
for(const entry of upstream) {
 const raw=fs.readFileSync(source+'/migrations/'+entry.name+'/migration.sql');assert.equal(sha(raw),entry.sourceSha256);
 const derived=raw.toString().replaceAll('"public".','"gc_documenso".').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;','-- pgcrypto is pre-provisioned in extensions by the administrator.').replace('CREATE EXTENSION IF NOT EXISTS pg_trgm;','-- pg_trgm is pre-provisioned in extensions by the administrator.').replaceAll('gen_random_bytes(step)','extensions.gen_random_bytes(step)').replaceAll(' gin_trgm_ops',' extensions.gin_trgm_ops');
 assert.equal(fs.readFileSync(root+'/migrations/'+entry.name+'/migration.sql','utf8'),derived);assert.equal(sha(derived),entry.sha256);
}
console.log(upstream.length+' upstream migration hashes and pinned image Prisma schema verified; only reviewed namespace/extension changes.');
