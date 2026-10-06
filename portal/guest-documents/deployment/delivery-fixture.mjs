import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from '/boundary/node_modules/pg/lib/index.js';
import {hashPassword} from '/upstream/apps/api/node_modules/better-auth/dist/crypto/index.mjs';
import {supabaseConnection} from '/boundary/deployment/supabase-config.mjs';
const f=JSON.parse(readFileSync('/private/fixture.json')),c=JSON.parse(readFileSync('/private/connection.json'));
assert.match(f.prefix,/^signing-review-[a-f0-9]{32}$/);assert.equal(c.projectRef,'saedetvoolpdysiyjwvg');
const config=supabaseConnection({url:c.databaseUrl,projectRef:c.projectRef,ca:c.databaseCa});assert.equal(config.user,'gc_app.'+c.projectRef);config.options='';
const db=new pg.Client(config);await db.connect();
try{
 await db.query('BEGIN');
 if(process.argv[2]==='seed'){
  const id=f.prefix+'-reviewer',password=await hashPassword(f.password);
  await db.query('INSERT INTO gc_atrium."user"(id,name,email,"emailVerified","updatedAt") VALUES($1,$2,$3,true,now()) ON CONFLICT(id) DO NOTHING',[id,'Nonbinding signing review',id+'@growthcast.invalid']);
  await db.query('INSERT INTO gc_atrium.account(id,"accountId","providerId","userId",password,"updatedAt") VALUES($1,$2,\'credential\',$2,$3,now()) ON CONFLICT(id) DO NOTHING',[id+'-account',id,password]);
  await db.query('INSERT INTO gc_atrium.member(id,"organizationId","userId",role) VALUES($1,$2,$3,\'admin\') ON CONFLICT(id) DO NOTHING',[id+'-member',f.organization,id]);
  await db.query('INSERT INTO gc_atrium.project(id,name,"organizationId","updatedAt") VALUES($1,\'NONBINDING signing acceptance\',$2,now()) ON CONFLICT(id) DO NOTHING',[f.project,f.organization]);
 }else if(['cleanup','cleanup-credentials'].includes(process.argv[2])){
  const id=f.prefix+'-reviewer';
  await db.query('DELETE FROM gc_atrium.session WHERE "userId"=$1',[id]);
  await db.query('DELETE FROM gc_atrium.account WHERE "userId"=$1',[id]);
  await db.query('DELETE FROM gc_atrium.member WHERE "userId"=$1 AND "organizationId"=$2',[id,f.organization]);
  if(process.argv[2]==='cleanup')await db.query('UPDATE gc_atrium.project SET "archivedAt"=now() WHERE id=$1 AND "organizationId"=$2',[f.project,f.organization]);
  assert.equal((await db.query('SELECT id FROM gc_atrium.account WHERE "userId"=$1',[id])).rowCount,0);
 }else throw Error('Unsupported fixture operation');
 await db.query('COMMIT');console.log('Controlled signing fixture '+process.argv[2]+' passed');
}catch{await db.query('ROLLBACK');console.error('Controlled signing fixture failed; private details withheld');process.exitCode=1;}finally{await db.end();}
