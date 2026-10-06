import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
export function deliverySecrets(key){
 if(!Buffer.isBuffer(key)||key.length!==32)throw Error('Delivery encryption key required');
 const privateKey=Buffer.from(key);
 const aad=id=>{if(typeof id!=='string'||! /^[a-f0-9-]{36}$/.test(id))throw Error('Delivery binding required');return Buffer.from('growthcast-document-delivery-v1:'+id);};
 return {
  seal(id,value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',privateKey,iv);cipher.setAAD(aad(id));const data=Buffer.from(JSON.stringify(value));if(data.length>16000)throw Error('Bounded delivery data required');return Buffer.concat([iv,cipher.update(data),cipher.final(),cipher.getAuthTag()]).toString('base64url');},
  open(id,value){if(typeof value!=='string'||value.length>32768||! /^[A-Za-z0-9_-]+$/.test(value))throw Error('Delivery data unavailable');const raw=Buffer.from(value,'base64url');if(raw.length<29)throw Error('Delivery data unavailable');const cipher=createDecipheriv('aes-256-gcm',privateKey,raw.subarray(0,12));cipher.setAAD(aad(id));cipher.setAuthTag(raw.subarray(-16));return JSON.parse(Buffer.concat([cipher.update(raw.subarray(12,-16)),cipher.final()]).toString());}
 };
}
