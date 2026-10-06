import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
export async function api(path, options = {}, providerIndex=0) {
  const { token } = JSON.parse(await readFile('/runtime/provider.json','utf8'))[providerIndex];
  const r = await fetch('http://documenso:3000/api/v2' + path, {
    ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
  if (!r.ok) throw new Error(`Provider ${path.split('/')[1]} returned ${r.status}: ${(await r.text()).slice(0,300)}`);
  return r;
}
function pdf() {
  const stream = 'BT /F1 20 Tf 50 750 Td (GrowthCast synthetic signing test) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let result = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((o,i)=>{ offsets.push(Buffer.byteLength(result)); result += `${i+1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(result);
  result += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(result);
}
export async function createEnvelope(order = 'SEQUENTIAL', providerIndex=0) {
  const form = new FormData();
  form.append('files',new Blob([pdf()],{type:'application/pdf'}),'synthetic.pdf');
  form.append('payload',JSON.stringify({title:`GrowthCast synthetic ${order} contract`,type:'DOCUMENT',
    meta:{signingOrder:order,distributionMethod:'NONE',typedSignatureEnabled:true,drawSignatureEnabled:false,uploadSignatureEnabled:false,allowDictateNextSigner:false},
    recipients:['Client','Countersigner'].map((name,i)=>({email:`${name.toLowerCase()}@growthcast.invalid`,name,role:'SIGNER',signingOrder:i+1,
      fields:[{type:'SIGNATURE',identifier:0,page:1,positionX:10,positionY:30+i*20,width:35,height:10}]}))}));
  const {id} = await (await api('/envelope/create',{method:'POST',body:form},providerIndex)).json();
  await api('/envelope/distribute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({envelopeId:id})},providerIndex);
  return (await api('/envelope/'+id,{},providerIndex)).json();
}
export async function bindingFor(envelope, recipient, {providerIndex=0,clientId='synthetic-client'}={}) {
  const provider=JSON.parse(await readFile('/runtime/provider.json','utf8'))[providerIndex];
  assert.equal(envelope.teamId,provider.teamId,'Provider envelope must belong to the selected team');
  return { environment:'local-test',organizationId:provider.organizationId,clientId,documentVersion:'version-1',
    envelopeId:envelope.id,documentId:Number(envelope.secondaryId.split('_')[1]),recipientId:recipient.id,recipientToken:recipient.token,
    recipientName:recipient.name,recipientEmail:recipient.email,fieldIds:envelope.fields.filter(f=>f.recipientId===recipient.id).map(f=>f.id),
    items:envelope.envelopeItems.map(i=>({id:i.id,dataId:i.documentDataId})) };
}
