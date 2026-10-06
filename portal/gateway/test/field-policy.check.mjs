import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allowRequest} from '../src/policy.mjs';
const binding={environment:'local-test',organizationId:'org',clientId:'client',documentVersion:'version',envelopeId:'envelope',documentId:1,recipientId:1,recipientToken:'token',recipientName:'Client',recipientEmail:'client@example.test',fieldIds:[1],items:[{id:'item',dataId:'data'}]};
const call=(type,value,b={...binding,fieldTypes:{1:type}},extra={})=>allowRequest('/api/trpc/envelope.field.sign','POST',JSON.stringify({json:{token:'token',fieldId:1,fieldValue:{type,value},...extra}}),b);
test('only the provider-bound field type and recipient field accept bounded responses',()=>{
 for(const [type,value] of [['SIGNATURE','typed'],['INITIALS','GC'],['NAME','Client'],['EMAIL','client@example.test'],['DATE',true],['TEXT','Company'],['NUMBER','123'],['CHECKBOX',[0]]]){
  assert.equal(call(type,value),true);assert.equal(call(type,value,undefined,{token:'wrong'}),false);assert.equal(call(type,value,undefined,{fieldId:2}),false);
 }
 assert.equal(call('TEXT','Company',{...binding,fieldTypes:{1:'SIGNATURE'}}),false);
 assert.equal(call('TEXT','Company',binding),false);
 assert.equal(call('TEXT','x'.repeat(10001)),false);assert.equal(call('CHECKBOX',[-1]),false);assert.equal(call('DATE','true'),false);
 assert.equal(call('TEXT',null),true);
});
test('text input accepts only the pinned optional authentication encoding',()=>{
 const b={...binding,fieldTypes:{1:'TEXT'}},body={json:{token:'token',fieldId:1,fieldValue:{type:'TEXT',value:'Company'},authOptions:null},meta:{values:{authOptions:['undefined']},v:1}};
 assert.equal(allowRequest('/api/trpc/envelope.field.sign','POST',JSON.stringify(body),b),true);
 body.meta.values={'fieldValue.value':['undefined']};assert.equal(allowRequest('/api/trpc/envelope.field.sign','POST',JSON.stringify(body),b),false);
});
