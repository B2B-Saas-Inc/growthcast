import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pdf} from '../web/pdf-fixture.mjs';
import {pdfPlaceholders} from './placeholders.mjs';
import {signingFields} from './fields.mjs';
test('imports Documenso signature and labeled required text using real PDF text coordinates',async()=>{
 const result=await pdfPlaceholders(pdf('','','{{signature, r1}}   {{text, r1, required=true, label=Company Name}}'));
 assert.deepEqual(result.warnings,[]);assert.equal(result.fields.length,2);assert.equal(result.fields[1].label,'Company Name');assert.equal(result.fields[1].required,true);assert.equal(result.fields[0].type,'SIGNATURE');assert(result.fields[1].positionX>result.fields[0].positionX);assert.equal(signingFields(result.fields,1).length,2);
});
test('type and recipient syntax is case insensitive; required=false is retained',async()=>{
 const {fields,warnings}=await pdfPlaceholders(pdf('','','{{ SIGNATURE, R1 }}   {{TeXt, r1, required=false}}'));assert.equal(warnings.length,0);assert.equal(fields[1].required,false);
});
test('unassigned, unsupported-recipient and unsupported-option tags are reported instead of misassigned',async()=>{
 for(const tag of ['{{name}}','{{signature, r2}}','{{text, r1, unknown=true}}','{{not_a_type, r1}}']){const r=await pdfPlaceholders(pdf('','',tag));assert.equal(r.fields.length,0);assert.equal(r.warnings.length,1);}
});
test('untagged PDFs remain unchanged and malformed PDF parsing fails',async()=>{
 assert.deepEqual(await pdfPlaceholders(pdf()),{fields:[],warnings:[]});await assert.rejects(pdfPlaceholders(Buffer.from('%PDF-1.7\ninvalid')));
});

test('imports Documenso formatting and pre-filled field metadata without changing its meaning',async()=>{
 const r=await pdfPlaceholders(pdf('','','{{text, r1, readOnly=true, text=Reference 123, fontSize=12}}'));assert.equal(r.warnings.length,0);assert.deepEqual(r.fields[0].meta,{fontSize:12,readOnly:true,text:'Reference 123'});
});
