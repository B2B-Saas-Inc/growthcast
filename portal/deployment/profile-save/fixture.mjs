import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import pg from '/boundary/node_modules/pg/lib/index.js';
import {hashPassword} from '/upstream/apps/api/node_modules/better-auth/dist/crypto/index.mjs';
import {supabaseConnection} from '/boundary/deployment/supabase-config.mjs';
import {StorageClient} from '/boundary/deployment/storage/client.mjs';
const secret=JSON.parse(readFileSync('/private/connection.json','utf8'));
const fixture=JSON.parse(readFileSync('/private/fixture.json','utf8'));
const prefix=fixture.prefix;assert.match(prefix,/^browser-[a-f0-9]{16}$/);
const org=prefix+'-org',other=prefix+'-other',user=prefix+'-user',project=prefix+'-project';
const config=supabaseConnection({projectRef:secret.projectRef,url:secret.databaseUrl,ca:secret.databaseCa});
assert(config.user==='gc_app.'+secret.projectRef);config.options='';const db=new pg.Client(config);
const auditDb=new pg.Client(supabaseConnection({projectRef:secret.projectRef,url:readFileSync('/audit/database-url','utf8').trim(),ca:secret.databaseCa}));
async function state(){const tables=(await auditDb.query("SELECT tablename FROM pg_tables WHERE schemaname='gc_atrium' ORDER BY tablename")).rows;const result={};for(const {tablename} of tables){assert.match(tablename,/^[A-Za-z0-9_]+$/);const {rows}=await auditDb.query(`SELECT row_to_json(t)::text AS row FROM gc_atrium."${tablename}" t`);const data=rows.map(x=>x.row).sort();result[tablename]={rows:data.length,sha256:createHash('sha256').update(JSON.stringify(data)).digest('hex')};}return result;}
try{
 await db.connect();await auditDb.connect();const mode=process.argv[2];
 if(mode==='seed'){
  writeFileSync('/private/before.json',JSON.stringify(await state()),{mode:0o600,flag:'wx'});
  const hash=await hashPassword(fixture.password);
  await db.query('BEGIN READ WRITE');
  await db.query('INSERT INTO gc_atrium.organization(id,name,"setupCompleted","updatedAt") VALUES($1,\'Browser acceptance\',true,now()),($2,\'Other browser organization\',true,now())',[org,other]);
  await db.query('INSERT INTO gc_atrium."user"(id,name,email,"emailVerified","updatedAt") VALUES($1,\'Browser acceptance user\',$2,true,now())',[user,fixture.email]);
  await db.query('INSERT INTO gc_atrium.account(id,"accountId","providerId","userId",password,"updatedAt") VALUES($1,$2,\'credential\',$2,$3,now())',[prefix+'-account',user,hash]);
  await db.query('INSERT INTO gc_atrium.member(id,"organizationId","userId",role) VALUES($1,$2,$3,\'member\')',[prefix+'-member',org,user]);
  await db.query('INSERT INTO gc_atrium.project(id,name,"organizationId","updatedAt") VALUES($1,\'Browser acceptance project\',$2,now()),($3,\'Other organization project\',$4,now())',[project,org,prefix+'-other-project',other]);
  await db.query('INSERT INTO gc_atrium.project_client(id,"projectId","userId") VALUES($1,$2,$3)',[prefix+'-assignment',project,user]);
  await db.query('COMMIT');
 }else if(mode==='revoke'){
  await db.query('DELETE FROM gc_atrium.project_client WHERE id=$1',[prefix+'-assignment']);
 }else if(mode==='cleanup'){
  const credentials=secret.storage;const storage=new StorageClient({...credentials,credentials});const path=org+'/'+project;
  const response=await storage.call('/storage/v1/object/list/'+storage.bucket,{method:'POST',headers:{...await storage.headers(),'content-type':'application/json'},body:JSON.stringify({prefix:path,limit:100})});assert.equal(response.status,200);const objects=await response.json();assert(objects.length<100);
  for(const object of objects){assert(object.id&&!object.name.includes('/'));await storage.delete(path+'/'+object.name);}
  await db.query('BEGIN READ WRITE');await db.query('DELETE FROM gc_atrium.client_profile WHERE "userId"=$1 AND "organizationId"=$2',[user,org]);await db.query('DELETE FROM gc_atrium.project WHERE id=ANY($1)',[[project,prefix+'-other-project']]);await db.query('DELETE FROM gc_atrium.organization WHERE id=ANY($1)',[[org,other]]);await db.query('DELETE FROM gc_atrium."user" WHERE id=$1',[user]);await db.query('COMMIT');
  const after=await state();writeFileSync('/private/after.json',JSON.stringify(after),{mode:0o600});assert.deepEqual(after,JSON.parse(readFileSync('/private/before.json','utf8')));
  const check=await storage.call('/storage/v1/object/list/'+storage.bucket,{method:'POST',headers:{...await storage.headers(),'content-type':'application/json'},body:JSON.stringify({prefix:path,limit:100})});assert.equal(check.status,200);assert.equal((await check.json()).length,0);
 }else throw Error('Unknown mode');
 console.log(JSON.stringify({mode,result:'passed'}));
}catch(error){console.error(JSON.stringify({failure:'fixture',code:error.code??error.name}));process.exitCode=1;await db.query('ROLLBACK').catch(()=>{});}finally{await db.end();await auditDb.end();}
