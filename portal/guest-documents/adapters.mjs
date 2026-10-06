import {timingSafeEqual} from 'node:crypto';
import {hash} from './workflow.mjs';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(x);
const origin=x=>typeof x==='string'&&x.startsWith('https://')&&new URL(x).origin===x;
function uniqueCookie(header,name){
 if(typeof header!=='string'||header.length>8192)return null;
 const parts=header.split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='));
 return parts.length===1?parts[0].slice(name.length+1):null;
}
async function boundedJson(response){
 if(!response.ok||!response.body)throw Error('Session unavailable');
 const reader=response.body.getReader();let size=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536)throw Error('Session unavailable');chunks.push(value);}}finally{await reader.cancel();}
 return JSON.parse(Buffer.concat(chunks).toString());
}
export function staffAuthenticator({pool,apiOrigin,portalOrigin,originProof,fetchImpl=fetch}){
 if(!pool?.query||!origin(apiOrigin)||!origin(portalOrigin)||!/^[a-f0-9]{64}$/.test(originProof))throw Error('Explicit authentication boundary required');
 return async req=>{
  try{
   if(req.headers.host!==new URL(portalOrigin).host||req.headers.authorization)return null;
   const cookie=uniqueCookie(req.headers.cookie,'__Secure-better-auth.session_token');
   if(!cookie||cookie.length>2048||! /^[A-Za-z0-9._%+=/-]+$/.test(cookie)||uniqueCookie(req.headers.cookie,'better-auth.session_token'))return null;
   const mutation=!['GET','HEAD'].includes(req.method);
   if(mutation){
    const csrf=uniqueCookie(req.headers.cookie,'csrf-token'),sent=req.headers['x-csrf-token'];
    if(req.headers.origin!==portalOrigin||typeof sent!=='string'||! /^[a-f0-9]{64}$/.test(sent)||!csrf||!/^[a-f0-9]{64}$/.test(csrf)||!timingSafeEqual(Buffer.from(sent),Buffer.from(csrf)))return null;
   }
   // Only the signed session cookie crosses this boundary. Never forward client-selected hosts, proofs or identities.
   const response=await fetchImpl(apiOrigin+'/api/auth/get-session?disableCookieCache=true',{headers:{cookie:'__Secure-better-auth.session_token='+cookie,origin:portalOrigin,'x-growthcast-origin':originProof},redirect:'error',signal:AbortSignal.timeout(10000)});
   const authenticated=await boundedJson(response);
   if(!id(authenticated?.session?.id)||!id(authenticated?.user?.id))return null;
   // Better Auth verifies the cookie; current database state controls authorization, including logout, verification and organization switches.
   const {rows}=await pool.query(`SELECT u.id AS "userId",s."activeOrganizationId" AS "organizationId",s.id AS "sessionId"
    FROM gc_atrium."session" s JOIN gc_atrium."user" u ON u.id=s."userId"
    JOIN gc_atrium.member m ON m."userId"=u.id AND m."organizationId"=s."activeOrganizationId"
    WHERE s.id=$1 AND u.id=$2 AND s."expiresAt">clock_timestamp() AND u."emailVerified" AND m.role IN ('owner','admin')`,[authenticated.session.id,authenticated.user.id]);
   return rows.length===1?{...rows[0],csrfValid:true}:null;
  }catch{return null;}
 };
}
// Read existing private project files. Upload validation/scanning is a separate required ingestion gate.
export function privateArtifacts({pool,storage}){
 if(!pool?.query||typeof storage?.download!=='function')throw Error('Private artifact database and storage required');
 const read=async({organizationId,projectId,key,sha256})=>{
  if(!id(organizationId)||!id(projectId)||typeof key!=='string'||key.length>512||!/^[a-f0-9]{64}$/.test(sha256))throw Error('Artifact unavailable');
  const authorized=async()=>{
   const {rows}=await pool.query(`SELECT f.id FROM gc_atrium.file f JOIN gc_atrium.project p ON p.id=f."projectId"
    WHERE f."storageKey"=$1 AND f."projectId"=$2 AND f."organizationId"=$3 AND p."organizationId"=$3 AND p."archivedAt" IS NULL`,[key,projectId,organizationId]);
   return rows.length===1;
  };
  if(!await authorized())throw Error('Artifact unavailable');
  const result=await storage.download(key),bytes=result.bytes;
  if(!Buffer.isBuffer(bytes)||bytes.length<8||bytes.length>3*1024*1024||result.contentType.split(';')[0].trim().toLowerCase()!=='application/pdf'||!bytes.subarray(0,8).toString('ascii').startsWith('%PDF-')||hash(bytes)!==sha256||!await authorized())throw Error('Artifact unavailable');
  return bytes;
 };
 return {read,verify:async binding=>{try{await read(binding);return true;}catch{return false;}}};
}
