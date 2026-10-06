import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApiProxy} from './vercel-api-proxy.mjs';
import {originAuthorized} from './api-origin.mjs';
const targets=JSON.parse(readFileSync(new URL('./targets.json',import.meta.url)));
const template=JSON.parse(readFileSync(new URL('./superseded/aws-foundation-rds.json',import.meta.url)));
const webOrigin=targets.environments.production.webOrigin,apiOrigin=targets.environments.production.apiOrigin,originSecret='a'.repeat(64);
test('staging and production use separate same-site origins and resources',()=>{
  const a=targets.environments.staging,b=targets.environments.production;
  for(const key of ['webOrigin','apiOrigin','signingOrigin','vercelProject','awsStack'])assert.notEqual(a[key],b[key]);
  assert.equal(a.mail,'google-workspace-smtp-with-synthetic-capture');
  for(const env of [a,b]){assert.equal(new URL(env.apiOrigin).hostname,'api.'+new URL(env.webOrigin).hostname);assert.equal(new URL(env.signingOrigin).hostname,'sign.'+new URL(env.webOrigin).hostname);}
});
test('superseded AWS proposal retains its historical security constraints',()=>{
 const r=template.Resources;
 assert.equal(r.Database.Properties.PubliclyAccessible,false);assert.equal(r.Database.Properties.StorageEncrypted,true);assert.equal(r.Database.Properties.DeletionProtection,true);
 assert.equal(r.DatabaseParameters.Properties.Parameters['rds.force_ssl'],'1');
 for(const name of ['Artifacts','Backups']){assert.equal(r[name].DeletionPolicy,'Retain');assert(Object.values(r[name].Properties.PublicAccessBlockConfiguration).every(Boolean));assert.equal(r[name].Properties.BucketEncryption.ServerSideEncryptionConfiguration[0].ServerSideEncryptionByDefault.SSEAlgorithm,'aws:kms');}
 for(const resource of Object.values(r))if(resource.Type==='AWS::EC2::SecurityGroupIngress'&&['ProviderSecurityGroup','DatabaseSecurityGroup'].includes(resource.Properties.GroupId.Ref))assert(resource.Properties.SourceSecurityGroupId&&!resource.Properties.CidrIp);
 assert.equal(r.Backups.Properties.ObjectLockConfiguration.Rule.DefaultRetention.Days,35);
});
test('proxy overwrites spoofed backend proof and forwarding headers; preserves cookie isolation',async()=>{
 const proxy=createApiProxy({webOrigin,apiOrigin,originSecret,fetchImpl:async(url,init)=>{
   assert.equal(url,apiOrigin+'/api/auth/get-session');assert(originAuthorized(init.headers,originSecret));
   assert.equal(init.headers.get('x-forwarded-host'),'clients.growthcast.app');assert.equal(init.headers.get('authorization'),null);
   assert.equal(init.headers.get('cookie'),'session=opaque');assert.equal(init.redirect,'manual');
   return new Response('ok',{headers:{'set-cookie':'session=opaque; HttpOnly; Secure; SameSite=Lax','cache-control':'public,max-age=1000'}});
 }});
 const response=await proxy(new Request(webOrigin+'/api/auth/get-session',{headers:{'cookie':'session=opaque','x-growthcast-origin':'spoof','x-forwarded-host':'evil.test','authorization':'spoof'}}));
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.match(response.headers.get('set-cookie'),/HttpOnly/);
});
test('anonymous direct origin and wrong credential fail closed',()=>{
 assert(!originAuthorized(new Headers(),originSecret));assert(!originAuthorized(new Headers({'x-growthcast-origin':'é'.repeat(64)}),originSecret));assert(!originAuthorized(new Headers({'x-growthcast-origin':'b'.repeat(64)}),originSecret));assert.throws(()=>originAuthorized(new Headers(),''));
});
test('proxy rejects cross-origin mutations, oversized bodies and unrelated routes before forwarding',async()=>{
 let calls=0;const proxy=createApiProxy({webOrigin,apiOrigin,originSecret,fetchImpl:async()=>{calls++;return new Response('bad');}});
 assert.equal((await proxy(new Request(webOrigin+'/api/test',{method:'POST',headers:{origin:'https://evil.test'}}))).status,403);
 assert.equal((await proxy(new Request(webOrigin+'/api/test',{method:'POST',headers:{origin:webOrigin},body:'x'.repeat(3*1024*1024+1)}))).status,413);
 assert.equal((await proxy(new Request(webOrigin+'/provider/pdf'))).status,404);assert.equal(calls,0);
});
test('proxy rejects external redirects, domain cookies and unsafe backend configuration',async()=>{
 for(const headers of [{location:'https://evil.test'},{'set-cookie':'session=x; Domain=growthcast.app'}]){
 const proxy=createApiProxy({webOrigin,apiOrigin,originSecret,fetchImpl:async()=>new Response(null,{status:302,headers})});assert.equal((await proxy(new Request(webOrigin+'/api/test'))).status,502);
 }
 assert.throws(()=>createApiProxy({webOrigin,apiOrigin:'http://localhost',originSecret}));
});

test('current selection uses Supabase and cannot silently select an unaudited project',()=>{assert.equal(targets.services.database,'supabase-postgresql');assert.match(targets.database.projectRef,/^[a-z]{20}$/);const audit=JSON.parse(readFileSync(new URL('./supabase-project-audit.json',import.meta.url)));assert.equal(audit.project.id,targets.database.projectRef);assert.equal(audit.project.organization_id,targets.database.organizationId);assert.equal(targets.database.migrations,'atrium-and-documenso-applied');const managed=JSON.parse(readFileSync(new URL('./supabase-managed-atrium-evidence.json',import.meta.url)));assert.equal(managed.migration.projectRef,targets.database.projectRef);const baseline=JSON.parse(readFileSync(new URL('./supabase/managed-atrium/migrations/manifest.json',import.meta.url)));assert.deepEqual(managed.migration.migrations,baseline.migrations.slice(0,6).map(({name,sha256})=>({name,sha256})));const current=JSON.parse(readFileSync(new URL("./revenue-report/migration-evidence.json",import.meta.url)));assert.deepEqual(current.migrations,baseline.migrations.slice(0,8).map(({name,sha256})=>({name,sha256})));assert.equal(current.schemaGuard,"passed");assert.equal(current.secondApplication,"no-op");assert.equal(managed.migration.migrations.length,6);assert.equal(managed.migration.schemaGuard,'passed');assert.equal(managed.migration.documensoMigrationsApplied,false);const isolation=JSON.parse(readFileSync(new URL('./supabase-isolation-evidence.json',import.meta.url)));assert.equal(isolation.projectRef,targets.database.projectRef);assert.equal(isolation.postgrest.db_schema,'portal_api');assert.equal(isolation.roles.length,6);assert(isolation.roles.every(r=>!r.rolcanlogin&&!r.rolsuper&&!r.rolcreaterole&&!r.rolcreatedb&&!r.rolinherit&&!r.rolreplication&&!r.rolbypassrls));});

test('managed provider evidence matches the locked history and keeps runtime logins disabled',()=>{
 const evidence=JSON.parse(readFileSync(new URL('./supabase-managed-documenso-evidence.json',import.meta.url)));
 const manifest=JSON.parse(readFileSync(new URL('./supabase/managed-documenso/manifest.json',import.meta.url)));
 assert.equal(evidence.migration.projectRef,targets.database.projectRef);
 assert.deepEqual(evidence.migration.migrations,manifest.migrations.map(({name,sha256})=>({name,sha256})));
 assert.equal(evidence.migration.documensoMigrationsApplied,true);assert.equal(evidence.migration.fingerprintVersion,2);assert.equal(evidence.upgradeFrom.migrationCount,165);assert.equal(evidence.migration.secondApplication,'no-op');
 assert.equal(evidence.postgrest.db_schema,'portal_api');assert(evidence.verification.roles.every(r=>!r.rolcanlogin));
});

test('proxy translates infrastructure HTML and transport failures into safe JSON errors',async()=>{
 for(const fetchImpl of [async()=>new Response('<html>private infrastructure error</html>',{status:503,headers:{'content-type':'text/html'}}),async()=>{throw Error('private transport details');}]) {
  const proxy=createApiProxy({webOrigin,apiOrigin,originSecret,fetchImpl});
  const response=await proxy(new Request(webOrigin+'/api/auth/sign-in/email',{method:'POST',headers:{origin:webOrigin}}));
  assert.ok([502,503].includes(response.status));assert.match(response.headers.get('content-type'),/application\/json/);
  assert.deepEqual(await response.json(),{message:'The portal is temporarily unavailable. Please try again shortly.'});
  assert.equal(response.headers.get('cache-control'),'private, no-store');
 }
});


test('guest upload proxy preserves raw PDF and only the two scoped metadata headers',async()=>{
 const webOrigin='https://portal.growthcast.test',apiOrigin='https://api.portal.growthcast.test',originSecret='a'.repeat(64),body=Buffer.from('%PDF-1.7\nsynthetic proxy fixture');
 let received;
 const proxy=createApiProxy({webOrigin,apiOrigin,originSecret,fetchImpl:async(url,init)=>{received=init;return Response.json({ok:true});}});
 const headers={origin:webOrigin,'content-type':'application/pdf','x-csrf-token':'synthetic','x-growthcast-document-id':'document-id','x-growthcast-document-title':'Review%20proposal','x-growthcast-scan-receipt':'forged','x-growthcast-origin':'forged'};
 assert.equal((await proxy(new Request(webOrigin+'/api/guest/staff/upload',{method:'POST',headers,body}))).status,200);
 assert.deepEqual(received.body,body);assert.equal(received.headers.get('x-growthcast-document-title'),'Review%20proposal');assert.equal(received.headers.get('x-growthcast-document-id'),'document-id');assert.equal(received.headers.get('x-growthcast-scan-receipt'),null);assert.equal(received.headers.get('x-growthcast-origin'),originSecret);
 await proxy(new Request(webOrigin+'/api/files',{method:'POST',headers,body}));assert.equal(received.headers.get('x-growthcast-document-id'),null);assert.equal(received.headers.get('x-growthcast-document-title'),null);
});
