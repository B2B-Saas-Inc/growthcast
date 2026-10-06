import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomUUID,randomBytes} from 'node:crypto';
import pg from 'pg';
import {staffAuthenticator,privateArtifacts} from './adapters.mjs';
import {StorageClient} from '/foundation/storage/client.mjs';
import {hash} from './workflow.mjs';
const pool=new pg.Pool({connectionString:readFileSync('/runtime/database-url','utf8'),ssl:{ca:readFileSync('/runtime/database-ca.crt','utf8'),rejectUnauthorized:true}});
const state=JSON.parse(readFileSync('/auth/session.json')),cookies=new Map(state.cookies),proof=readFileSync('/origin/api-origin','utf8').trim(),portalOrigin='https://portal.growthcast.invalid',apiOrigin='https://api.growthcast.invalid';
const checks=[];let storage,key;
const transport=(url,options)=>{assert.equal(new URL(url).origin,apiOrigin);return fetch(url.replace(apiOrigin,'http://provider:3001'),options);};
const authenticate=staffAuthenticator({pool,apiOrigin,portalOrigin,originProof:proof,fetchImpl:transport});
const csrf=randomBytes(32).toString('hex');
const req={method:'POST',headers:{host:'portal.growthcast.invalid',origin:portalOrigin,cookie:[...cookies].map(([k,v])=>k+'='+v).filter(x=>!x.startsWith('csrf-token=')).join('; ')+'; csrf-token='+csrf,'x-csrf-token':csrf}};
try{
 assert.equal(await authenticate(req),null);checks.push('actual verified client session denied staff access');
 await pool.query("UPDATE gc_atrium.member SET role='admin' WHERE \"userId\"=$1 AND \"organizationId\"='runtime-org'",[state.identity]);
 const actor=await authenticate(req);assert.equal(actor?.userId,state.identity);assert.equal(actor.organizationId,'runtime-org');assert(actor.csrfValid);checks.push('actual signed Better Auth cookie resolves verified staff and active organization');
 const cookieName='__Secure-better-auth.session_token';
 for(const headers of [{origin:'https://evil.invalid'},{'x-csrf-token':'wrong'},{cookie:req.headers.cookie+'; '+cookieName+'='+cookies.get(cookieName)},{cookie:cookieName+'=forged; csrf-token='+csrf},{authorization:'Bearer forged'}])assert.equal(await authenticate({...req,headers:{...req.headers,...headers}}),null);checks.push('forged session duplicate cookie bearer and CSRF/origin attacks denied');
 // Even a stale/cached successful provider result cannot override a deleted database session.
 const stale={session:{id:actor.sessionId},user:{id:actor.userId}};
 const staleAuthenticate=staffAuthenticator({pool,apiOrigin,portalOrigin,originProof:proof,fetchImpl:async()=>new Response(JSON.stringify(stale))});
 await pool.query('UPDATE gc_atrium."user" SET "emailVerified"=false WHERE id=$1',[state.identity]);assert.equal(await staleAuthenticate(req),null);await pool.query('UPDATE gc_atrium."user" SET "emailVerified"=true WHERE id=$1',[state.identity]);
 await pool.query('UPDATE gc_atrium."session" SET "activeOrganizationId"=NULL WHERE id=$1',[actor.sessionId]);assert.equal(await staleAuthenticate(req),null);await pool.query('UPDATE gc_atrium."session" SET "activeOrganizationId"=$2 WHERE id=$1',[actor.sessionId,'runtime-org']);checks.push('current verification and active organization override cached identity');
 if(existsSync('/connector/storage.json')){
  const c=JSON.parse(readFileSync('/connector/storage.json'));assert.equal(c.projectRef,'saedetvoolpdysiyjwvg');assert.equal(c.bucket,'gc-atrium-private');storage=new StorageClient({projectRef:c.projectRef,bucket:c.bucket,credentials:c});key=c.testKey;assert.match(key,/^guest-connector-test\/[a-f0-9-]{36}\.pdf$/);
  // Controlled synthetic bytes test retrieval and scope only, not PDF scanning/rendering.
  const bytes=Buffer.from('%PDF-1.7\nGrowthCast synthetic connector fixture\n%%EOF\n'),sha256=hash(bytes);
  await storage.upload(key,bytes,'application/pdf');
  await pool.query("INSERT INTO gc_atrium.project(id,name,\"organizationId\",\"updatedAt\") VALUES('connector-project','Synthetic connector','runtime-org',now())");
  await pool.query('INSERT INTO gc_atrium.file(id,filename,"storageKey","projectId","organizationId","uploadedById","mimeType") VALUES($1,$2,$3,$4,$5,$6,$7)',['connector-file','fixture.pdf',key,'connector-project','runtime-org',state.identity,'application/pdf']);
  let downloads=0;const artifacts=privateArtifacts({pool,storage:{download:async k=>{downloads++;return storage.download(k);}}});
  const binding={organizationId:'runtime-org',projectId:'connector-project',key,sha256};assert.deepEqual(await artifacts.read(binding),bytes);assert(await artifacts.verify(binding));checks.push('real private Supabase object retrieved with byte-exact approved hash');
  const before=downloads;for(const b of [{...binding,organizationId:'other-org'},{...binding,projectId:'other-project'},{...binding,key:'../other.pdf'}])assert.equal(await artifacts.verify(b),false);assert.equal(downloads,before);checks.push('foreign organization project and unbound key denied before storage request');
  assert.equal(await artifacts.verify({...binding,sha256:'0'.repeat(64)}),false);await pool.query("UPDATE gc_atrium.project SET \"archivedAt\"=now() WHERE id='connector-project'");assert.equal(await artifacts.verify(binding),false);checks.push('wrong hash and archived project denied');
  await pool.query("UPDATE gc_atrium.project SET \"archivedAt\"=NULL WHERE id='connector-project'");
  await pool.query("DELETE FROM gc_atrium.file WHERE id='connector-file'");assert.equal(await artifacts.verify(binding),false);checks.push('deleted application binding denies access regardless of storage cache');
  await storage.delete(key);
  const freshReader=new StorageClient({projectRef:c.projectRef,bucket:c.bucket,credentials:c});
  await assert.rejects(()=>freshReader.download(key));key=undefined;checks.push('synthetic cloud object deletion verified with independent fresh storage authentication');
 }
 const logout=await transport(apiOrigin+'/api/auth/sign-out',{method:'POST',headers:{origin:portalOrigin,'x-growthcast-origin':proof,cookie:req.headers.cookie,'content-type':'application/json'},body:'{}'});assert(logout.ok);assert.equal(await authenticate(req),null);assert.equal(await staleAuthenticate(req),null);checks.push('real logout and stale session-result replay denied');
 writeFileSync('/evidence.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,passed:checks.length,realBetterAuth:true,realSupabaseStorage:!!storage,cloudDatabaseWrites:0,productionWrites:0,mail:'synthetic local capture only',tlsScope:'database and live Supabase HTTPS; local API transport is isolated HTTP'},null,2)+'\n');console.log('Connector checks passed: '+checks.length);
}finally{try{if(key&&storage)await storage.delete(key);}finally{await pool.end();}}
