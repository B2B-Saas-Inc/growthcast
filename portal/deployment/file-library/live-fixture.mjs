import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import pg from '/boundary/node_modules/pg/lib/index.js';
import {hashPassword} from '/upstream/apps/api/node_modules/better-auth/dist/crypto/index.mjs';
import {supabaseConnection} from '/boundary/deployment/supabase-config.mjs';
import {StorageClient} from '/boundary/deployment/storage/client.mjs';
const c=JSON.parse(readFileSync('/private/connection.json')),f=JSON.parse(readFileSync('/private/fixture.json')),p=f.prefix;
assert.match(p,/^library-[a-f0-9]{16}$/);assert.equal(c.projectRef,f.projectRef);
const config=supabaseConnection({projectRef:c.projectRef,url:c.databaseUrl,ca:c.databaseCa});assert.equal(config.user,'gc_app.'+c.projectRef);config.options='';const db=new pg.Client(config);
try {
 await db.connect();
 if(process.argv[2]==='seed') {
  const hash=await hashPassword(f.password);await db.query('BEGIN');
  await db.query('INSERT INTO gc_atrium.organization(id,name,"setupCompleted","updatedAt") VALUES($1,\'Library release review\',true,now())',[p+'-org']);
  for(const [suffix,role] of [['owner','owner'],['client','member']]) {
   const id=p+'-'+suffix;
   await db.query('INSERT INTO gc_atrium."user"(id,name,email,"emailVerified","updatedAt") VALUES($1,$2,$3,true,now())',[id,'Library review '+suffix,id+'@growthcast.invalid']);
   await db.query('INSERT INTO gc_atrium.account(id,"accountId","providerId","userId",password,"updatedAt") VALUES($1,$2,\'credential\',$2,$3,now())',[id+'-account',id,hash]);
   await db.query('INSERT INTO gc_atrium.member(id,"organizationId","userId",role) VALUES($1,$2,$3,$4)',[id+'-member',p+'-org',id,role]);
  }
  await db.query('INSERT INTO gc_atrium.project(id,name,"organizationId","updatedAt") VALUES($1,\'Library release review\',$2,now())',[p+'-project',p+'-org']);
  await db.query('INSERT INTO gc_atrium.project_client(id,"projectId","userId") VALUES($1,$2,$3)',[p+'-pc',p+'-project',p+'-client']);
  await db.query('COMMIT');
 } else if(process.argv[2]==='cleanup') {
  const keys=(await db.query('SELECT "storageKey" AS key FROM gc_atrium.file WHERE "organizationId"=$1 UNION SELECT "storageKey" FROM gc_atrium.library_file WHERE "organizationId"=$1',[p+'-org'])).rows.map(r=>r.key).filter(Boolean);
  // Journal before deleting database records so interrupted object cleanup can be retried.
  let prior=[];try{prior=JSON.parse(readFileSync('/private/cleanup-keys.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const all=[...new Set([...prior,...keys])];writeFileSync('/private/cleanup-keys.json',JSON.stringify(all),{mode:0o600});
  await db.query('BEGIN');await db.query('DELETE FROM gc_atrium.project WHERE id=$1 AND name=\'Library release review\' AND \"organizationId\"=$2',[p+'-project',p+'-org']);await db.query('DELETE FROM gc_atrium.organization WHERE id=$1',[p+'-org']);await db.query('DELETE FROM gc_atrium."user" WHERE id=ANY($1)',[[p+'-owner',p+'-client']]);await db.query('COMMIT');
  const storage=new StorageClient({projectRef:c.projectRef,bucket:c.storage.bucket,credentials:c.storage});for(const key of all)await storage.delete(key);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM gc_atrium.project WHERE id=$1',[p+'-project'])).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM gc_atrium.file WHERE \"organizationId\"=$1',[p+'-org'])).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM gc_atrium.organization WHERE id=$1',[p+'-org'])).rows[0].n,0);
 }else throw Error('Unsupported fixture mode');
 console.log(JSON.stringify({operation:process.argv[2],result:'passed',scope:'random isolated Library review workspace'}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(JSON.stringify({operation:'fixture',code:e.code??e.name}));process.exitCode=1;}finally{await db.end();}
