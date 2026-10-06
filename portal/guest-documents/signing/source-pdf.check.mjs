import assert from 'node:assert/strict';
import test from 'node:test';
import {PDF,rgb} from '@libpdf/core';
import {pdf} from '../web/pdf-fixture.mjs';
import {sourcePdfProof,pdfObjectHash} from './source-pdf-core.mjs';
test('untagged source retains exact-byte verification',async()=>assert.deepEqual(await sourcePdfProof(pdf()),{tagged:false}));
test('tagged source proof ignores generated file ID but binds content',async()=>{
 const bytes=pdf('','','{{signature, r1}} {{text, r1, label=Company}}');
 const a=await sourcePdfProof(bytes),b=await sourcePdfProof(bytes);assert.equal(a.objectHash,b.objectHash);assert.equal(a.tagCount,2);
 assert.notEqual(await pdfObjectHash(bytes),a.objectHash);
 const changed=await sourcePdfProof(pdf('','','Changed contract {{signature, r1}} {{text, r1, label=Company}}'));assert.notEqual(changed.objectHash,a.objectHash);
 const d=await PDF.load(bytes);d.getPages()[0].drawRectangle({x:0,y:0,width:100,height:100,color:rgb(1,0,0)});assert.notEqual((await sourcePdfProof(Buffer.from(await d.save()))).objectHash,a.objectHash);
});
test('unsupported recipient tags cannot be prepared',async()=>assert.rejects(()=>sourcePdfProof(pdf('','','{{signature, r2}}'))));
