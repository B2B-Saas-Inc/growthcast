import {createPinAccess} from '../../gateway/src/pin.mjs';
import {digest} from '../../gateway/src/store.mjs';
export const documentGrantTtl = 7 * 24 * 60 * 60;
// Reuse the existing gateway PIN/session engine. Its scope additionally follows
// the current guest dispatch, project and approval on every private request.
export function deliveryGateway({store,pool,environment}){
 if(!store?.issue||!store?.redeem||!store?.authorize||!pool?.query||!['local-test','staging','production'].includes(environment))throw Error('Configured delivery gateway required');
 const pins=createPinAccess(store);
 const allowed=async(table,key,value)=>{
  const {rowCount}=await pool.query(`SELECT grant_id FROM gc_atrium.${table} WHERE ${key}=$1 AND gc_atrium.guest_gateway_active(grant_id)`,[value]);return rowCount===1;
 };
 return {
  async provision({id,source,binding}){
   const existing=await pool.query("SELECT id FROM gc_atrium.guest_send WHERE id=$1 AND status='grant_creating' AND approval_id=$2 AND envelope_id=$3 AND lease_until>clock_timestamp()",[id,source.approvalId,binding.envelopeId]);
   if(!existing.rowCount)throw Error('Delivery grant unavailable');
   const ttl=Math.min(documentGrantTtl,Math.floor((new Date(source.expiresAt).getTime()-Date.now())/1000));
   const grant=await store.issue({environment,organizationId:source.organization_id,clientId:source.client_id,documentVersion:source.versionId,
    envelopeId:binding.envelopeId,documentId:binding.documentId,recipientId:binding.recipientId,recipientToken:binding.recipientToken,
    ...(source.message.policy.pinDelivery==='none'?{pinRequired:false}:{}),recipientName:binding.recipientName,recipientEmail:binding.recipientEmail,fieldIds:binding.fieldIds,fieldTypes:binding.fieldTypes,items:binding.items},ttl);
   const access=await pins.provision(grant.id);
   await pool.query('INSERT INTO gc_atrium.guest_send_grant(send_id,grant_id) VALUES($1,$2)',[id,grant.id]);
   return {...access,grantId:grant.id};
  },
  pinAccess:{async unlock(share,pin,source){
   if(typeof share!=='string'||!await allowed('pin_shares','share_hash',digest(share)))return null;
   const handoff=await pins.unlock(share,pin,source);
   return handoff&&await allowed('handoffs','token_hash',digest(handoff))?handoff:null;
  }},
  store:{...store,
   async redeem(handoff){if(typeof handoff!=='string'||!await allowed('handoffs','token_hash',digest(handoff)))return null;return store.redeem(handoff);},
   async authorize(token){if(typeof token!=='string'||!await allowed('sessions','token_hash',digest(token)))return null;const result=await store.authorize(token);return result&&await allowed('sessions','token_hash',digest(token))?result:null;}
  }
 };
}
