import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync,rmSync} from 'node:fs';
import pg from '/boundary/node_modules/pg/lib/index.js';
import {deliverConnections} from '/boundary/deployment/runtime-connections/deliver.mjs';
import {runtimeConfig} from '/boundary/deployment/runtime/config.mjs';
import {StorageClient} from '/boundary/deployment/storage/client.mjs';
const driverSources=JSON.parse(process.env.DRIVER_SOURCES);
const prefix=process.env.FIXTURE_PREFIX;
assert.match(prefix,/^cloud-[a-f0-9]{16}$/);
const org=prefix+'-org',other=prefix+'-other-org',project=prefix+'-project',email=prefix+'-invited@growthcast.invalid';
const state='/run/config/evidence';mkdirSync(state,{mode:0o700});
const replacements={'runtime-other-org':other,'runtime-org':org,'runtime-unassigned-file':prefix+'-unassigned-file','runtime-other-file':prefix+'-other-file','runtime-unassigned':prefix+'-unassigned','runtime-other-project':prefix+'-other-project','runtime-project':project,'runtime-invite':prefix+'-invite','invited@growthcast.invalid':email,'expired@growthcast.invalid':prefix+'-expired@growthcast.invalid','http://provider:3001':'http://127.0.0.1:3001','http://mail:1080':'http://127.0.0.1:1080','https://portal.growthcast.invalid':'https://clients.growthcast.app','/evidence/':state+'/','synthetic-password-1234':randomBytes(32).toString('hex')};
for(const [name,source] of Object.entries(driverSources)) {let code=source;for(const [from,to] of Object.entries(replacements))code=code.replaceAll(from,to);writeFileSync(state+'/'+name,code,{mode:0o400,flag:'wx'});}
let child,exited,connection,db,storage,fixtureCreated=false,passed=false,operation='delivery';
async function run(name,mode){const process=spawn('/usr/local/bin/bun',[state+'/'+name,mode],{stdio:'ignore'});const code=await new Promise(resolve=>{process.once('exit',resolve);process.once('error',()=>resolve(-1));});assert.equal(code,0,'Bounded driver failed');}
async function start(){
 child=spawn('/usr/local/bin/bun',['/boundary/deployment/runtime/start.mjs','/usr/local/bin/bun','/upstream/apps/api/dist/main.js'],{env:{...process.env,GC_SERVICE:'atrium',GC_SECRET_MODE:'secretsmanager',SUPABASE_PROJECT_REF:'saedetvoolpdysiyjwvg'},stdio:'ignore'});
 exited=new Promise(resolve=>{child.once('exit',resolve);child.once('error',()=>resolve(-1));});
 for(let i=0;i<90;i++){assert.equal(child.exitCode,null);try{const response=await fetch('http://127.0.0.1:3001/api/health',{signal:AbortSignal.timeout(2000)});if(response.ok)return;await response.body?.cancel();}catch{/* Bounded readiness retry. */}await new Promise(resolve=>setTimeout(resolve,1000));}
 throw Error('Health timeout');
}
async function stop(){if(child){child.kill('SIGTERM');await Promise.race([exited,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Stop timeout')),20000);timer.unref();})]);child=undefined;}}
try {
 connection=await deliverConnections({service:'atrium'});
 const caPath=connection.directory+'/database-ca.crt';
 const {config}=runtimeConfig({service:'atrium',projectRef:'saedetvoolpdysiyjwvg',url:readFileSync(connection.directory+'/database-url','utf8'),ca:readFileSync(caPath,'utf8'),caPath});
 db=new pg.Client(config);await db.connect();
 const credentials=JSON.parse(readFileSync('/run/storage/credentials.json','utf8'));storage=new StorageClient({...credentials,credentials});
 operation='seed';await db.query('BEGIN READ WRITE');
 assert.equal((await db.query('SELECT id FROM gc_atrium.organization WHERE id=ANY($1)',[[org,other]])).rows.length,0);
 await db.query('INSERT INTO gc_atrium.organization(id,name,"updatedAt") VALUES($1,$2,now()),($3,$4,now())',[org,'Cloud synthetic agency',other,'Other cloud synthetic agency']);
 await db.query('INSERT INTO gc_atrium.invitation(id,"organizationId",email,role,status,"expiresAt","inviterId") VALUES($1,$2,$3,\'member\',\'pending\',now()+interval \'1 hour\',$4),($5,$2,$6,\'member\',\'pending\',now()-interval \'1 hour\',$4)',[prefix+'-invite',org,email,prefix+'-inviter',prefix+'-expired',prefix+'-expired@growthcast.invalid']);
 await db.query('COMMIT');fixtureCreated=true;
 connection.cleanup();connection=undefined;
 const applicationEnv={NODE_ENV:'production',PATH:'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',PORT:'3001',WEB_URL:'https://clients.growthcast.app',API_URL:'https://api.growthcast.invalid',SECURE_COOKIES:'true',ALLOW_SIGNUPS:'false',BILLING_ENABLED:'false',STORAGE_PROVIDER:'supabase',PORTAL_STORAGE_PROJECT_REF:'saedetvoolpdysiyjwvg',PORTAL_STORAGE_BUCKET:'gc-atrium-private',SENTRY_ENABLED:'false',LOG_LEVEL:'silent',PORTAL_MAIL_MODE:'capture',PORTAL_MAIL_CAPTURE_HOST:'127.0.0.1'};
 writeFileSync('/run/config/application-env.json',JSON.stringify(applicationEnv),{flag:'wx',mode:0o400});
 operation='startup';await start();
 operation='account';await run('auth.mjs','begin');
 operation='enroll';await db.query('BEGIN READ WRITE');
 await db.query('INSERT INTO gc_atrium.project(id,name,"organizationId","updatedAt") VALUES($1,\'Assigned\',$2,now()),($3,\'Unassigned\',$2,now()),($4,\'Other\',$5,now())',[project,org,prefix+'-unassigned',prefix+'-other-project',other]);
 await db.query('INSERT INTO gc_atrium.project_client(id,"projectId","userId") SELECT $1,$2,id FROM gc_atrium."user" WHERE email=$3',[prefix+'-assignment',project,email]);
 await db.query('INSERT INTO gc_atrium.file(id,filename,"storageKey","projectId","organizationId","uploadedById","updatedAt") VALUES($1,\'private.txt\',\'synthetic-unassigned\',$2,$3,$4,now()),($5,\'private.txt\',\'synthetic-other\',$6,$7,$4,now())',[prefix+'-unassigned-file',prefix+'-unassigned',org,prefix+'-operator',prefix+'-other-file',prefix+'-other-project',other]);
 await db.query('COMMIT');
 operation='files';await run('storage.mjs','upload');
 operation='restart';await stop();await start();await run('auth.mjs','resume');await run('storage.mjs','resume');
 operation='revocation';await db.query('BEGIN READ WRITE');await db.query('DELETE FROM gc_atrium.project_client WHERE id=$1',[prefix+'-assignment']);await db.query('COMMIT');await run('storage.mjs','denied');
 operation='logout';await run('auth.mjs','logout');passed=true;
}catch{console.error(JSON.stringify({stage:'FAILED',operation}));process.exitCode=1;}
finally {
 try {
  await stop();connection?.cleanup();
  if(db)await db.query('ROLLBACK');
  if(fixtureCreated) {
   // The prefix belongs exclusively to this run; list exact project paths even if upload returned no ID.
   for(const projectId of [project,prefix+'-unassigned']) {
    const path=org+'/'+projectId;
    const response=await storage.call('/storage/v1/object/list/'+storage.bucket,{method:'POST',headers:{...await storage.headers(),'content-type':'application/json'},body:JSON.stringify({prefix:path,limit:100})});assert.equal(response.status,200);
    const objects=await response.json();assert(Array.isArray(objects)&&objects.length<100);
    for(const object of objects){assert(object.id && typeof object.name==='string'&&!object.name.includes('/'));await storage.delete(path+'/'+object.name);}
    const verify=await storage.call('/storage/v1/object/list/'+storage.bucket,{method:'POST',headers:{...await storage.headers(),'content-type':'application/json'},body:JSON.stringify({prefix:path,limit:100})});assert.equal(verify.status,200);assert.equal((await verify.json()).length,0);
   }
   await db.query('BEGIN READ WRITE');
   await db.query('DELETE FROM gc_atrium.project WHERE id=ANY($1)',[[project,prefix+'-unassigned',prefix+'-other-project']]);
   await db.query('DELETE FROM gc_atrium.organization WHERE id=ANY($1)',[[org,other]]);
   await db.query('DELETE FROM gc_atrium."user" WHERE email=ANY($1)',[[email,prefix+'-expired@growthcast.invalid']]);
   await db.query('COMMIT');
  }
  await db?.end();db=undefined;rmSync(state,{recursive:true});
  for(const path of ['/run/delivered/material','/run/connections/material','/run/origin/api-origin','/run/storage/credentials.json'])assert(!existsSync(path));
  console.log(JSON.stringify({stage:'CLEANED',fixturePrefix:prefix}));
  if(passed)console.log(JSON.stringify({stage:'VERIFIED',service:'atrium',fixturePrefix:prefix,invitedVerifiedAccount:true,organizationIsolation:true,privateManagedFile:true,sessionAndFileAcrossProcessRestart:true,membershipRevocation:true,logoutReplayDenial:true,fixtureCleanup:true,plaintextRemoved:true}));
 }catch{console.error(JSON.stringify({stage:'CLEANUP_FAILED',fixturePrefix:prefix}));process.exitCode=1;child?.kill('SIGKILL');await db?.end().catch(()=>{});}
}
