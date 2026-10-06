import {sourcePdf} from './source-pdf.mjs';
import {createHash} from 'node:crypto';
import {signingFields,fieldsHash,providerFields} from './fields.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=()=>{throw Error('Signing provider binding unavailable');};
const identifier=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(x);
async function boundedPdf(response){
 if(!response.ok||!response.body)fail();
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>3*1024*1024)fail();chunks.push(value);}}
 finally{await reader.cancel();reader.releaseLock();}
 return Buffer.concat(chunks);
}
// Server-only adapter. Never return provider recipient tokens through staff APIs.
// The orchestration layer must persist the draft ID before activation. Ambiguous
// POST failures are deliberately not retried: reconcile the provider first.
export function signingProvider({api,teamId}){
 if(typeof api!=='function'||!Number.isSafeInteger(teamId)||teamId<1)fail();
 function approved(source){
  const fields=signingFields(source.fields,source.pageCount);
  if(!identifier(source.approvalId)||!identifier(source.versionId)||source.fieldsSha256!==fieldsHash(fields)||! /^[a-f0-9]{64}$/.test(source.artifactSha256)||typeof source.title!=='string'||!source.title.trim()||source.title.length>200||/[\x00-\x1f]/.test(source.title)||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(source.recipientEmail)||source.recipientEmail!==source.recipientEmail.toLowerCase()||source.recipientEmail.length>254)fail();
  return fields;
 }
 async function inspect(id,source,status,configuring=false){
  const fields=approved(source);if(!identifier(id))fail();
  const e=await (await api('/envelope/'+encodeURIComponent(id))).json();
  if(e.id!==id||e.teamId!==teamId||e.externalId!==source.approvalId||e.title!==source.title||e.status!==status||e.type!=='DOCUMENT'||e.recipients?.length!==1||e.envelopeItems?.length!==1||(!Array.isArray(e.fields)||e.fields.length>100||!configuring&&e.fields.length!==fields.length)||e.documentMeta?.distributionMethod!=='NONE')fail();
  const recipient=e.recipients[0],item=e.envelopeItems[0];
  if(recipient.email!==source.recipientEmail||recipient.role!=='SIGNER'||!Number.isSafeInteger(recipient.id)||typeof recipient.token!=='string'||!recipient.token||!identifier(item.id)||!identifier(item.documentDataId)||!/^document_[1-9][0-9]*$/.test(e.secondaryId)||e.directLink?.enabled)fail();
  // Match the complete multiset, not just field count or position in API output.
  const remaining=[...e.fields];
  for(const expected of configuring?[]:providerFields(fields)){
   const index=remaining.findIndex(f=>(status!=='DRAFT'||!f.inserted)&&(!!f.fieldMeta?.readOnly===!!expected.fieldMeta.readOnly)&&f.recipientId===recipient.id&&f.envelopeItemId===item.id&&f.type===expected.type&&f.page===expected.page&&['positionX','positionY','width','height'].every(k=>Math.abs(Number(f[k])-expected[k])<0.001)&&Object.entries(expected.fieldMeta).every(([k,v])=>JSON.stringify(f.fieldMeta?.[k])===JSON.stringify(v)));
   if(index<0)fail();remaining.splice(index,1);
  }
  const response=await api('/envelope/item/'+encodeURIComponent(item.id)+'/download');
  const bytes=await boundedPdf(response);
  if(source.pdfProof?.tagged){if(await sourcePdf(bytes,'hash')!==source.pdfProof.objectHash)fail();}else if(hash(bytes)!==source.artifactSha256)fail();
  if(configuring&&e.fields.some(f=>f.inserted||f.recipientId!==recipient.id||f.envelopeItemId!==item.id||!Number.isSafeInteger(f.id)))fail();
  return {envelopeId:e.id,teamId,versionId:source.versionId,approvalId:source.approvalId,fieldsSha256:source.fieldsSha256,artifactSha256:source.artifactSha256,
   documentId:Number(e.secondaryId?.split('_')[1]),recipientId:recipient.id,recipientEmail:recipient.email,recipientName:recipient.name,recipientToken:recipient.token,
   fieldIds:e.fields.map(f=>f.id),fieldTypes:Object.fromEntries(e.fields.map(f=>[String(f.id),f.type])),items:[{id:item.id,dataId:item.documentDataId}],status:e.status};
 }
 return {
  async prepareSource(source,bytes){approved(source);if(hash(bytes)!==source.artifactSha256)fail();return {...source,pdfProof:await sourcePdf(bytes)};},
  async configureDraft(id,source){
   if(!source.pdfProof?.tagged)return;
   const binding=await inspect(id,source,'DRAFT',true);
   if(binding.fieldIds.length!==source.pdfProof.tagCount)fail();
   for(const fieldId of binding.fieldIds)await api('/envelope/field/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fieldId})});
   await api('/envelope/field/create-many',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({envelopeId:id,data:providerFields(approved(source)).map(({identifier,...field})=>({...field,recipientId:binding.recipientId,envelopeItemId:binding.items[0].id}))})});
   await inspect(id,source,'DRAFT');
  },
  async createDraft(source,bytes){
   const fields=approved(source);
   if(!Buffer.isBuffer(bytes)||bytes.length<8||bytes.length>3*1024*1024||bytes.subarray(0,5).toString()!=='%PDF-'||hash(bytes)!==source.artifactSha256)fail();
   const form=new FormData();form.append('files',new Blob([bytes],{type:'application/pdf'}),'document.pdf');
   form.append('payload',JSON.stringify({title:source.title,type:'DOCUMENT',externalId:source.approvalId,
    meta:{signingOrder:'SEQUENTIAL',distributionMethod:'NONE',typedSignatureEnabled:true,drawSignatureEnabled:true,uploadSignatureEnabled:false,allowDictateNextSigner:false},
    recipients:[{email:source.recipientEmail,name:source.recipientEmail,role:'SIGNER',signingOrder:1,fields:source.pdfProof?.tagged?[]:providerFields(fields)}]}));
   const {id}=await (await api('/envelope/create',{method:'POST',body:form})).json();
   if(!identifier(id))fail();
   // Return the durable ID immediately. The caller persists it before performing
   // readback, so a verification failure cannot cause another create on retry.
   return {envelopeId:id,approvalId:source.approvalId,status:'draft-created'};
  },
  inspectDraft:(id,source)=>inspect(id,source,'DRAFT'),
  async activate(id,source){
   await inspect(id,source,'DRAFT');
   await api('/envelope/distribute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({envelopeId:id,meta:{distributionMethod:'NONE'}})});
   return inspect(id,source,'PENDING');
  },
  inspectPending:(id,source)=>inspect(id,source,'PENDING')
 };
}
