import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {StorageClient} from '../storage/client.mjs';
const raw=readFileSync('/target/settings.json');assert.equal(createHash('sha256').update(raw).digest('hex'),process.env.RECOVERY_CONFIG_SHA256,'Immutable recovery configuration required');
const s=JSON.parse(raw),m=JSON.parse(readFileSync('/restored/manifest.json','utf8'));
assert.notEqual(s.projectRef,'saedetvoolpdysiyjwvg');assert.equal(s.intent,'production-initial-migration');assert.equal(m.schemaVersion,2);
const client=c=>new StorageClient({projectRef:s.projectRef,bucket:'gc-atrium-private',credentials:c});
const writer=client(s.writer),reader=client(s.reader);const hash=b=>createHash('sha256').update(b).digest('hex');
const mode=process.argv[2]??'restore';assert.ok(['restore','read','revoked'].includes(mode));
if(s.readerAccessToken){reader.access=s.readerAccessToken;reader.expires=s.readerExpiresAt;}
try{
 for(const [schema,table] of [['gc_atrium','user'],['gc_documenso','User'],['portal_meta','migrations']]){
  const response=await fetch('https://'+s.projectRef+'.supabase.co/rest/v1/'+table+'?select=*&limit=0',{headers:{apikey:s.reader.publishableKey,'Accept-Profile':schema},redirect:'error',signal:AbortSignal.timeout(15000)});assert.ok(!response.ok,'Private schema must not be available through Data API');
 }
 let total=0;
 for(const object of m.objects){
  assert.equal(object.file,'objects/'+hash(Buffer.from(object.name))+'.bin');
  const bytes=readFileSync('/restored/'+object.file);assert.equal(hash(bytes),object.sha256);assert.equal(bytes.length,object.bytes);
  if(mode==='revoked'){await assert.rejects(()=>reader.download(object.name));assert.equal(hash((await writer.download(object.name)).bytes),object.sha256);total+=bytes.length;continue;}
  if(mode==='restore')await writer.upload(object.name,bytes,object.metadata.mimetype??'application/octet-stream');
  const got=await reader.download(object.name);assert.equal(hash(got.bytes),object.sha256);assert.equal(got.contentType.split(';')[0].trim().toLowerCase(),(object.metadata.mimetype??'application/octet-stream').split(';')[0].trim().toLowerCase());total+=bytes.length;
  await assert.rejects(()=>writer.upload(object.name,bytes,object.metadata.mimetype??'application/octet-stream'));
  const token=await reader.token();
  for(const [method,path,body] of [['POST','/storage/v1/object/'+reader.objectPath(object.name+'-forbidden'),bytes],['DELETE','/storage/v1/object/gc-atrium-private',JSON.stringify({prefixes:[object.name]})]]){
   const res=await reader.call(path,{method,headers:{apikey:s.reader.publishableKey,Authorization:'Bearer '+token,'content-type':method==='DELETE'?'application/json':'application/octet-stream'},body});if(method==='POST')assert.ok(!res.ok,'Reader write must fail');
   assert.equal(hash((await reader.download(object.name)).bytes),object.sha256,'Reader delete must preserve bytes');
  }
  const anonymous=await fetch('https://'+s.projectRef+'.supabase.co/storage/v1/object/'+reader.objectPath(object.name),{headers:{apikey:s.reader.publishableKey},redirect:'error',signal:AbortSignal.timeout(15000)});assert.ok(!anonymous.ok);
 }
 console.log(JSON.stringify({dataApiPrivateSchemasDenied:true,readerRevocationVerified:mode==='revoked',stage:'STORAGE_VERIFIED',objects:m.objects.length,objectBytes:total,originalKeysPreserved:true,writerOverwriteDenied:mode==='revoked'?null:true,readerMutationDenied:mode==='revoked'?null:true,anonymousDenied:mode==='revoked'?null:true,authSubjectsRecreated:true}));
}catch{console.error('Replacement storage check failed; sensitive details withheld');process.exitCode=1;}
