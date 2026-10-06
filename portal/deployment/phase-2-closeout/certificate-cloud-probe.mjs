import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire('/boundary/package.json');
const {SecretsManagerClient,GetSecretValueCommand}=require('@aws-sdk/client-secrets-manager');
const {fromContainerMetadata}=require('@aws-sdk/credential-providers');
import {readFileSync,writeFileSync,existsSync,unlinkSync} from 'node:fs';
import pg from '/boundary/node_modules/pg/lib/index.js';
import {deliverConnections} from '/boundary/deployment/runtime-connections/deliver.mjs';
import {runtimeConfig,verifyRuntime} from '/boundary/deployment/runtime/config.mjs';
import {guard as atriumGuard} from '/boundary/deployment/supabase/managed-atrium/migrate.mjs';
import {guard as documensoGuard} from '/boundary/deployment/supabase/managed-documenso/migrate.mjs';
import {StorageClient} from '/boundary/deployment/storage/client.mjs';
let connections,child,db,signingPassphrase;
const certPin=JSON.parse(process.env.SIGNING_CERTIFICATE_PIN);
const certPath='/run/config/signing.p12';
let operation='delivery';
try {
 const service=process.env.GC_SERVICE,atrium=service==='atrium';
 connections=await deliverConnections({service});
 operation='peer-secret-denial';
 const pins=JSON.parse(readFileSync('/boundary/deployment/runtime-connections/pins.json','utf8'));
 const client=new SecretsManagerClient({region:'us-east-1',credentials:fromContainerMetadata(),maxAttempts:1});
 try {const response=await client.send(new GetSecretValueCommand({SecretId:certPin.arn,VersionId:certPin.version}));assert.equal(response.VersionId,certPin.version);const value=JSON.parse(response.SecretString);assert.equal(value.purpose,'staging-document-signing-only');writeFileSync(certPath,Buffer.from(value.p12,'base64'),{flag:'wx',mode:0o400});signingPassphrase=value.passphrase;
 await assert.rejects(client.send(new GetSecretValueCommand({SecretId:pins[atrium?'documenso':'atrium'].arn})),error=>error.name==='AccessDeniedException');}finally{client.destroy();}

 const caPath=connections.directory+'/database-ca.crt';
 const {config,expected}=runtimeConfig({service,projectRef:'saedetvoolpdysiyjwvg',url:readFileSync(connections.directory+'/database-url','utf8'),ca:readFileSync(caPath,'utf8'),caPath});
 operation='guard';await verifyRuntime(new pg.Client(config),expected,atrium?atriumGuard:documensoGuard);
 db=new pg.Client(config);await db.connect();
 operation='denials';
 for(const sql of ['SELECT * FROM pg_authid LIMIT 0',atrium?'SELECT * FROM gc_documenso."User" LIMIT 0':'SELECT * FROM gc_atrium."user" LIMIT 0'])await assert.rejects(db.query(sql),error=>error.code==='42501');
 await db.end();db=undefined;
 if(atrium){operation='storage-auth';const credentials=JSON.parse(readFileSync('/run/storage/credentials.json','utf8'));const storage=new StorageClient({projectRef:credentials.projectRef,bucket:credentials.bucket,credentials});await storage.token();}
 connections.cleanup();connections=undefined;
 const applicationEnv=atrium?{
  NODE_ENV:'production',PATH:'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',PORT:'3001',WEB_URL:'https://clients.growthcast.app',API_URL:'https://api.growthcast.invalid',SECURE_COOKIES:'true',ALLOW_SIGNUPS:'false',BILLING_ENABLED:'false',STORAGE_PROVIDER:'supabase',PORTAL_STORAGE_PROJECT_REF:'saedetvoolpdysiyjwvg',PORTAL_STORAGE_BUCKET:'gc-atrium-private',SENTRY_ENABLED:'false',LOG_LEVEL:'silent',PORTAL_MAIL_MODE:'capture'
 }:{
  NODE_ENV:'production',PATH:'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',HOSTNAME:'0.0.0.0',PORT:'3000',NEXT_PUBLIC_WEBAPP_URL:'https://sign.growthcast.invalid',NEXT_PRIVATE_INTERNAL_WEBAPP_URL:'http://127.0.0.1:3000',NEXT_PUBLIC_UPLOAD_TRANSPORT:'database',NEXT_PRIVATE_JOBS_PROVIDER:'local',NEXT_PUBLIC_DISABLE_SIGNUP:'true',NEXT_PRIVATE_SMTP_TRANSPORT:'smtp-auth',NEXT_PRIVATE_SMTP_HOST:'mail',NEXT_PRIVATE_SMTP_PORT:'1025',NEXT_PRIVATE_SMTP_SECURE:'false',NEXT_PRIVATE_SMTP_FROM_NAME:'Synthetic staging check',NEXT_PRIVATE_SMTP_FROM_ADDRESS:'test@growthcast.invalid',NEXT_PUBLIC_POSTHOG_KEY:'',NEXT_TELEMETRY_DISABLED:'1',DOCUMENSO_DISABLE_TELEMETRY:'true'
 };
 Object.assign(applicationEnv,{NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH:certPath,NEXT_PRIVATE_SIGNING_PASSPHRASE:signingPassphrase});
 writeFileSync('/run/config/application-env.json',JSON.stringify(applicationEnv),{flag:'wx',mode:0o400});
 operation='application-startup';
 const engine=atrium?'/usr/local/bin/bun':'/usr/local/bin/node';
 child=spawn(engine,['/boundary/deployment/runtime/start.mjs',engine,atrium?'/upstream/apps/api/dist/main.js':'/app/apps/remix/build/server/main.js'],{env:{...process.env,GC_SECRET_MODE:'secretsmanager',SUPABASE_PROJECT_REF:'saedetvoolpdysiyjwvg'},stdio:'ignore'});
 const exited=new Promise(resolve=>{child.once('exit',code=>resolve(code));child.once('error',()=>resolve(-1));});
 let healthy=false;
 for(let attempt=0;attempt<90;attempt++) {
  if(child.exitCode!==null)throw Error('Application exited before health');
  try {const response=await fetch('http://127.0.0.1:'+(atrium?3001:3000)+'/api/health',{signal:AbortSignal.timeout(2000)});const health=await response.json();healthy=response.ok&&health.checks?.database?.status==='ok'&&health.checks?.certificate?.status==='ok';}catch{/* Retry bounded startup. */}
  if(healthy)break;
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 assert(healthy);
 if(atrium){const response=await fetch('http://127.0.0.1:3001/api/me');assert.equal(response.status,403);await response.body?.cancel();}
 operation='shutdown';child.kill('SIGTERM');
 await Promise.race([exited,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Shutdown timeout')),20000);timer.unref();})]);child=undefined;
 assert(!existsSync('/run/connections/material'));assert(!existsSync('/run/delivered/material'));assert(!existsSync('/run/storage/credentials.json'));assert(!existsSync('/run/origin/api-origin'));
 unlinkSync(certPath);unlinkSync('/run/config/application-env.json');
 console.log(JSON.stringify({managedSigningCertificateHealthy:true,stage:'VERIFIED',service,uid:process.getuid(),restrictedTlsAndSchemaGuard:true,crossSchemaAndCatalogDenials:2,peerConnectionSecretDenied:true,storageIdentityVerified:atrium,actualApplicationHealth:true,plaintextRemoved:true}));
}catch{console.error(JSON.stringify({stage:'FAILED',operation}));process.exitCode=1;}
finally{if(child)child.kill('SIGKILL');await db?.end().catch(()=>{});connections?.cleanup();if(existsSync(certPath))unlinkSync(certPath);}
