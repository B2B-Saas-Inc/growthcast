import {isDeepStrictEqual} from 'node:util';
import {messagePreview} from '../message.mjs';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Hydrate only the approved placeholders. Never accept HTML, sender or recipient
// overrides from the Send request. Secret values are never included in subjects.
export function deliveryMessages(source,{share,pin},origin,sendId){
 if(typeof origin!=='string'||!origin.startsWith('https://')||new URL(origin).origin!==origin||! /^[A-Za-z0-9_-]{43}$/.test(share)||! /^\d{8}$/.test(pin)||! /^[a-f0-9-]{36}$/.test(sendId))throw Error('Delivery access unavailable');
 const approved={...source.message};delete approved.signing;
 if(!isDeepStrictEqual(approved,messagePreview({...source,requirePin:source.message.policy.pinDelivery!=='none'})))throw Error('Approved email template changed');
 const url=origin+'/unlock#'+share;
 const result={};
 for(const kind of (approved.policy.pinDelivery==='none'?['document']:['document','pin'])){
  const template=approved[kind],placeholder=approved.policy[kind==='document'?'linkPlaceholder':'pinPlaceholder'];
  const replace=(value,replacement)=>{const at=value.lastIndexOf(placeholder);if(at<0)throw Error('Approved email placeholder missing');return value.slice(0,at)+replacement+value.slice(at+placeholder.length);};
  result[kind]={from:approved.from,replyTo:approved.replyTo,to:approved.to,subject:template.subject,
   text:replace(template.text,kind==='document'?url:pin),
   html:replace(template.html,kind==='document'?`<a href="${escape(url)}" style="color:#fff;text-decoration:underline">Open document</a>`:pin),
   messageId:`<growthcast-${sendId}-${kind}@growthcast.app>`};
 }
 return result;
}
// Adapt the portal's existing configured Nodemailer transport. Success means SMTP
// accepted this recipient; it does not prove inbox delivery or signature completion.
export function documentMailer(createTransport){
 if(typeof createTransport!=='function')throw Error('Workspace mail transport required');
 return {async send(message){
  const transport=await createTransport();
  try{const result=await transport.sendMail(message);
   if(result.rejected?.length||!result.accepted?.some(address=>(typeof address==='string'?address:address.address)?.toLowerCase()===message.to.toLowerCase()))throw Error('Recipient not accepted');
   return {accepted:true};
  }catch{throw Error('Document mail outcome unconfirmed');}finally{transport.close();}
 }};
}
