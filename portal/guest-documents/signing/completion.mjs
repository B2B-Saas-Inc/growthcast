import {createHash} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=()=>{throw Error('Verified document completion unavailable');};
// Trusted lifecycle worker only. A browser event or a webhook body is never
// completion evidence; read the canonical envelope and verify its sealed PDF.
export function documentCompletion({pool,api,verifySealed,storage,teamId}){
 if(!pool?.query||typeof api!=='function'||typeof verifySealed!=='function'||!storage?.upload||!storage?.download||!Number.isSafeInteger(teamId))fail();
 return {async reconcile({sendId,binding}){
  if(!/^[a-f0-9-]{36}$/.test(sendId)||!binding?.envelopeId||!/^[A-Za-z0-9_-]{1,160}$/.test(binding.envelopeId))fail();
  const envelope=await (await api('/envelope/'+binding.envelopeId)).json();
  if(envelope.id!==binding.envelopeId||envelope.externalId!==binding.approvalId||envelope.teamId!==teamId||envelope.secondaryId!=='document_'+binding.documentId||envelope.recipients?.length!==1||envelope.envelopeItems?.length!==1)fail();
  if(envelope.status==='PENDING')return {pending:true};
  if(envelope.status!=='COMPLETED')fail();
  const recipient=envelope.recipients[0],item=envelope.envelopeItems[0];
  if(recipient.id!==binding.recipientId||recipient.email!==binding.recipientEmail||recipient.token!==binding.recipientToken||recipient.signingStatus!=='SIGNED'||item.id!==binding.items[0]?.id||!/^[A-Za-z0-9_-]{1,160}$/.test(item.documentDataId)||JSON.stringify(envelope.fields.map(f=>f.id).sort((a,b)=>a-b))!==JSON.stringify([...binding.fieldIds].sort((a,b)=>a-b)))fail();
  const response=await api('/envelope/item/'+item.id+'/download');if(!response.ok||!response.body)fail();
  let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>16*1024*1024)fail();chunks.push(chunk);}
  const bytes=Buffer.concat(chunks);if(bytes.subarray(0,5).toString()!=='%PDF-'||await verifySealed(bytes)!==true)fail();
  const sha256=hash(bytes),key='guest-executed/'+sendId+'.pdf';
  let stored;try{stored=await storage.download(key);}catch{await storage.upload(key,bytes,'application/pdf');stored=await storage.download(key);}
  if(!Buffer.isBuffer(stored.bytes)||stored.contentType!=='application/pdf'||hash(stored.bytes)!==sha256)fail();
  const {rows}=await pool.query('SELECT gc_atrium.publish_guest_completion($1,$2,$3,$4,$5) AS document_id',[sendId,item.id,item.documentDataId,sha256,bytes.length]);
  return {documentId:rows[0].document_id,sha256};
 }};
}
