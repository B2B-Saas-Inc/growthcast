import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {capture,validateInventory,limits} from './capture-core.mjs';
import {verifyObjects} from './restore-objects.mjs';
const bucket='gc-atrium-private';
const object=(name,id='11111111-1111-4111-8111-111111111111')=>({id,bucket_id:bucket,name,metadata:{size:3}});
test('signed artifacts above the ordinary upload limit survive capture and restore',async()=>{
 const bytes=Buffer.alloc(4*1024*1024,37);
 await fixture(async f=>{const result=await f.execute();assert.equal(result.objectBytes,bytes.length);const target=join(f.directory,'restored');mkdirSync(target);const manifest=JSON.parse(readFileSync(join(f.directory,'manifest.json')));assert.deepEqual(verifyObjects(manifest,f.directory,target,true),{objects:1,bytes:bytes.length});assert.deepEqual(readFileSync(join(target,'signed.pdf')),bytes);},
 {objects:[{...object('signed.pdf'),metadata:{size:bytes.length}}],references:[{key:'signed.pdf'}],download:async()=>({bytes})});
});
async function fixture(run,{objects=[object('a.txt')],references=[{key:'a.txt'}],change=()=>{},download=async()=>({bytes:Buffer.from('abc')})}={}) {
  const directory=mkdtempSync(join(tmpdir(),'capture-check-'));let inventory=structuredClone(objects),locked=false,transaction=false,dumped=false,bundled=false;
  const source={lock:async()=>{locked=true;return true;},unlock:async()=>{locked=false;},begin:async()=>{transaction=true;},rollback:async()=>{transaction=false;},commit:async()=>{transaction=false;},
    snapshot:async()=>'00000001-00000002-1',guard:async()=>{},objects:async()=>structuredClone(inventory),references:async()=>references,
    catalog:async()=>[{count:2}],roles:async()=>[],dump:async()=>{assert.ok(transaction);dumped=true;await change(inventory);},
    bundle:async()=>{bundled=true;writeFileSync(join(directory,'bundle.tar'),'fixture');}};
  try {await run({directory,source,storage:{download},execute:()=>capture({source,storage:{download},directory,projectRef:'saedetvoolpdysiyjwvg',bucket,storageSubject:'reader'}),status:()=>({locked,transaction,dumped,bundled})});}
  finally {rmSync(directory,{recursive:true,force:true});}
}
test('captures all objects including unreferenced files and safe encoded archive paths',async()=>fixture(async f=>{
  const result=await f.execute();assert.equal(result.objects,2);assert.equal(result.objectBytes,6);
  const m=JSON.parse(readFileSync(join(f.directory,'manifest.json')));assert.equal(m.schemaVersion,2);assert.equal(m.objects.length,2);
  for(const entry of m.objects) {assert.match(entry.file,/^objects\/[a-f0-9]{64}\.bin$/);assert.equal(readFileSync(join(f.directory,entry.file),'utf8'),'abc');}
  assert.deepEqual(f.status(),{locked:false,transaction:false,dumped:true,bundled:true});
},{objects:[object('a.txt'),object('nested/unreferenced ü.txt','22222222-2222-4222-8222-222222222222')]}));
test('empty bucket is a valid capture',async()=>fixture(async f=>{assert.equal((await f.execute()).objects,0);},{objects:[],references:[]}));
test('canonical row proofs carry an explicit format while legacy captures stay unmarked',async()=>{
 await fixture(async f=>{await f.execute();assert.equal(JSON.parse(readFileSync(join(f.directory,'manifest.json'))).catalogFormat,undefined);});
 await fixture(async f=>{f.source.catalogFormat='bytewise-v1';await f.execute();assert.equal(JSON.parse(readFileSync(join(f.directory,'manifest.json'))).catalogFormat,'bytewise-v1');});
});
for(const [name,change] of [
  ['deletion',rows=>rows.splice(0,1)],
  ['addition',rows=>rows.push(object('new.txt','22222222-2222-4222-8222-222222222222'))],
  ['same-name same-size replacement',rows=>{rows[0].id='22222222-2222-4222-8222-222222222222';}],
  ['metadata edit',rows=>{rows[0].metadata.changed=true;}]
])test(name+' invalidates the capture and removes partial output',async()=>fixture(async f=>{
  await assert.rejects(f.execute,/inventory changed/);assert.deepEqual(readdirSync(f.directory),[]);assert.equal(f.status().locked,false);assert.equal(f.status().bundled,false);
},{change}));
test('missing referenced object refuses capture before dump',async()=>fixture(async f=>{
  await assert.rejects(f.execute,/Referenced object missing/);assert.deepEqual(readdirSync(f.directory),[]);assert.equal(f.status().dumped,false);assert.equal(f.status().transaction,false);
},{references:[{key:'missing.txt'}]}));
for(const [name,download] of [['download failure',async()=>{throw Error('unavailable');}],['size mismatch',async()=>({bytes:Buffer.from('x')})]])test(name+' rolls back and cleans output',async()=>fixture(async f=>{
  await assert.rejects(f.execute);assert.deepEqual(readdirSync(f.directory),[]);assert.equal(f.status().transaction,false);assert.equal(f.status().locked,false);
},{download}));
test('concurrent capture lock refusal never starts snapshot',async()=>fixture(async f=>{
  f.source.lock=async()=>false;await assert.rejects(f.execute,/Another capture/);assert.equal(f.status().transaction,false);
}));
test('preexisting output is never overwritten or removed',async()=>fixture(async f=>{
  writeFileSync(join(f.directory,'keep'),'existing');await assert.rejects(f.execute,/Fresh capture/);assert.equal(readFileSync(join(f.directory,'keep'),'utf8'),'existing');
}));
test('unsafe keys, duplicate bindings and capacity violations fail closed',()=>{
  for(const key of ['../x','/absolute','x/../y','x\\y','x//y','x\n'])assert.throws(()=>validateInventory([object(key)],bucket));
  assert.throws(()=>validateInventory([object('a'),object('b')],bucket));
  assert.throws(()=>validateInventory([object('a'),object('a','22222222-2222-4222-8222-222222222222')],bucket));
  assert.throws(()=>validateInventory([{...object('x'),metadata:{size:limits.objectBytes+1}}],bucket));
  assert.throws(()=>validateInventory([{...object('x'),bucket_id:'other'}],bucket));
});

test('multi-object restore verifies hashes and names, rejects overwrite and changed target bytes',async()=>fixture(async f=>{
  await f.execute();const manifest=JSON.parse(readFileSync(join(f.directory,'manifest.json')));
  const target=join(f.directory,'target');mkdirSync(target);
  assert.deepEqual(verifyObjects(manifest,f.directory,target,true),{objects:2,bytes:6});
  assert.deepEqual(verifyObjects(manifest,f.directory,target),{objects:2,bytes:6});
  await assert.rejects(async()=>verifyObjects(manifest,f.directory,target,true),/Fresh object target/);
  writeFileSync(join(target,'a.txt'),'xyz');assert.throws(()=>verifyObjects(manifest,f.directory,target));
},{objects:[object('a.txt'),object('nested/b.txt','22222222-2222-4222-8222-222222222222')]}));
test('tampered archive object fails before any target write',async()=>fixture(async f=>{
  await f.execute();const manifest=JSON.parse(readFileSync(join(f.directory,'manifest.json')));
  const target=join(f.directory,'target');mkdirSync(target);
  writeFileSync(join(f.directory,manifest.objects[1].file),'xyz');
  assert.throws(()=>verifyObjects(manifest,f.directory,target,true));assert.deepEqual(readdirSync(target),[]);
},{objects:[object('a.txt'),object('b.txt','22222222-2222-4222-8222-222222222222')]}));
