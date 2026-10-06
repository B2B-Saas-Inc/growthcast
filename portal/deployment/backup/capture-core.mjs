import assert from 'node:assert/strict';
import {mkdirSync,readdirSync,writeFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
export const limits={objects:10000,objectBytes:16*1024*1024,totalBytes:128*1024*1024};
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function validKey(key) {
  return typeof key==='string' && key.length>0 && key.length<=1024 && !key.includes('\\') &&
    ![...key].some(c=>c.charCodeAt(0)<32 || c.charCodeAt(0)===127) &&
    !key.split('/').some(part=>!part || part==='.' || part==='..');
}
export function validateInventory(objects,bucket) {
  assert.ok(Array.isArray(objects) && objects.length<=limits.objects,'Object limit exceeded');
  const names=new Set(),ids=new Set();let total=0;
  for(const object of objects) {
    assert.equal(object.bucket_id,bucket);assert.ok(validKey(object.name),'Unsafe object key');
    assert.match(object.id,/^[a-f0-9-]{36}$/);
    assert.ok(!names.has(object.name) && !ids.has(object.id),'Duplicate object binding');
    names.add(object.name);ids.add(object.id);
    const size=object.metadata?.size;
    assert.ok(Number.isSafeInteger(size) && size>=0 && size<=limits.objectBytes,'Invalid object size');
    total+=size;assert.ok(total<=limits.totalBytes,'Capture byte limit exceeded');
  }
  return names;
}
// Dependencies separate snapshot/storage coordination from cloud credentials and CLI transport.
export async function capture({source,storage,directory,projectRef,bucket,storageSubject}) {
  assert.deepEqual(readdirSync(directory),[],'Fresh capture directory required');
  let locked=false,transaction=false,completed=false;
  try {
    locked=await source.lock();assert.ok(locked,'Another capture is active');
    await source.begin();transaction=true;
    const snapshot=await source.snapshot();
    assert.match(snapshot,/^[A-F0-9-]+$/);
    await source.guard();
    const objects=await source.objects();const names=validateInventory(objects,bucket);
    const references=await source.references();
    assert.ok(references.every(ref=>validKey(ref.key) && names.has(ref.key)),'Referenced object missing from snapshot');
    const tables=await source.catalog();const roles=await source.roles();
    mkdirSync(join(directory,'objects'),{mode:0o700});
    const entries=[];
    for(const object of objects) {
      const {bytes}=await storage.download(object.name);
      assert.equal(bytes.length,object.metadata.size,'Object length differs from snapshot');
      const digest=sha256(bytes),file='objects/'+sha256(Buffer.from(object.name))+'.bin';
      writeFileSync(join(directory,file),bytes,{flag:'wx',mode:0o600});
      entries.push({...object,file,sha256:digest,bytes:bytes.length});
    }
    // Both dumps import the still-open exported snapshot. Application DML may continue.
    await source.dump(snapshot,directory);
    await source.commit();transaction=false;
    // Fresh statement sees commits made since the snapshot. Reject object delete/recreate,
    // metadata edits and additions, including same-name/same-size replacements with new IDs.
    assert.deepEqual(await source.objects(),objects,'Object inventory changed during capture');
    const manifest={schemaVersion:2,projectRef,bucket,databaseIdentity:'gc_backup',storageSubject,
      ...(source.catalogFormat ? {catalogFormat:source.catalogFormat} : {}),
      capturedAt:new Date().toISOString(),consistency:'exported-database-snapshot-and-unchanged-object-inventory',
      tables,roles,references,objects:entries};
    writeFileSync(join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
    await source.bundle(directory,entries.map(entry=>entry.file));
    completed=true;
    return {tables:tables.length,rows:tables.reduce((sum,table)=>sum+table.count,0),objects:entries.length,objectBytes:entries.reduce((sum,entry)=>sum+entry.bytes,0)};
  } finally {
    try {if(transaction)await source.rollback();} finally {
      try {if(locked)await source.unlock();} finally {
        // No incomplete manifest/bundle survives a failed capture.
        if(!completed)for(const name of readdirSync(directory))rmSync(join(directory,name),{recursive:true,force:true});
      }
    }
  }
}

// Supports both the live Library schema and the additive guest-document release.
export async function readReferences(db) {
      const guest=(await db.query("SELECT to_regclass('gc_atrium.guest_artifact') IS NOT NULL AS present")).rows[0].present;
      return (await db.query(`SELECT 'file' AS kind,id,"storageKey" AS key FROM gc_atrium.file WHERE "storageKey" IS NOT NULL
      UNION ALL SELECT 'library',id,"storageKey" FROM gc_atrium.library_file
      UNION ALL SELECT 'update',id,image_key FROM gc_atrium.project_update WHERE image_key IS NOT NULL
      UNION ALL SELECT 'branding',id,"logoKey" FROM gc_atrium.branding WHERE "logoKey" IS NOT NULL
      UNION ALL SELECT 'signature',id,"signatureImageKey" FROM gc_atrium.document_response WHERE "signatureImageKey" IS NOT NULL
      ${guest ? "UNION ALL SELECT 'guest',storage_key,storage_key FROM gc_atrium.guest_artifact" : ''}
      ORDER BY kind,id`)).rows;
}
