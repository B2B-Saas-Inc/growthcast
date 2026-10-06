import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {validateInventory,sha256} from './capture-core.mjs';
export function verifyObjects(manifest,archiveRoot,targetRoot,restore=false) {
  assert.equal(manifest.schemaVersion,2);assert.equal(manifest.projectRef,'saedetvoolpdysiyjwvg');assert.equal(manifest.bucket,'gc-atrium-private');
  const names=validateInventory(manifest.objects,manifest.bucket);
  assert.ok(Array.isArray(manifest.references) && manifest.references.every(ref=>names.has(ref.key)),'Missing referenced object');
  if(restore)assert.deepEqual(readdirSync(targetRoot),[],'Fresh object target required');
  let total=0;
  // Validate every archive object before writing the first target byte.
  for(const object of manifest.objects) {
    assert.equal(object.file,'objects/'+sha256(Buffer.from(object.name))+'.bin');assert.match(object.sha256,/^[a-f0-9]{64}$/);
    assert.equal(object.bytes,object.metadata.size);
    const bytes=readFileSync(join(archiveRoot,object.file));
    assert.equal(bytes.length,object.bytes);assert.equal(sha256(bytes),object.sha256);total+=bytes.length;
    if(!restore) {
      const target=readFileSync(join(targetRoot,object.name));
      assert.equal(target.length,object.bytes);assert.equal(sha256(target),object.sha256);
    }
  }
  if(restore)for(const object of manifest.objects) {
    const path=join(targetRoot,object.name);mkdirSync(dirname(path),{recursive:true,mode:0o700});
    writeFileSync(path,readFileSync(join(archiveRoot,object.file)),{flag:'wx',mode:0o600});
  }
  return {objects:manifest.objects.length,bytes:total};
}
