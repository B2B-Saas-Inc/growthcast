import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from '/boundary/node_modules/pg/lib/index.js';
import {hashPassword} from '/upstream/apps/api/node_modules/better-auth/dist/crypto/index.mjs';
import {supabaseConnection} from '/boundary/deployment/supabase-config.mjs';
const c=JSON.parse(readFileSync('/private/connection.json','utf8')),f=JSON.parse(readFileSync('/private/fixture.json','utf8'));
const p=f.prefix;assert.match(p,/^planning-[a-f0-9]{16}$/);
const config=supabaseConnection({projectRef:c.projectRef,url:c.databaseUrl,ca:c.databaseCa});assert(config.user==='gc_app.'+c.projectRef);config.options='';const db=new pg.Client(config);
try {
 await db.connect();await db.query('BEGIN');
 if(process.argv[2]==='seed') {
  const hash=await hashPassword(f.password);
  for(const suffix of ['org','other'])await db.query('INSERT INTO gc_atrium.organization(id,name,"setupCompleted","updatedAt") VALUES($1,$2,true,now())',[p+'-'+suffix,'Resource planning review']);
  for(const [suffix,role] of [['owner','owner'],['employee','admin'],['client','member']]) {
   const id=p+'-'+suffix;
   await db.query('INSERT INTO gc_atrium."user"(id,name,email,"emailVerified","updatedAt") VALUES($1,$2,$3,true,now())',[id,suffix==='employee'?'Review specialist':'Planning '+suffix,id+'@growthcast.invalid']);
   await db.query('INSERT INTO gc_atrium.account(id,"accountId","providerId","userId",password,"updatedAt") VALUES($1,$2,\'credential\',$2,$3,now())',[id+'-account',id,hash]);
   await db.query('INSERT INTO gc_atrium.member(id,"organizationId","userId",role) VALUES($1,$2,$3,$4)',[id+'-member',p+'-org',id,role]);
  }
  for(const [suffix,org] of [['project','org'],['second','org'],['foreign','other']]) await db.query('INSERT INTO gc_atrium.project(id,name,"organizationId","updatedAt") VALUES($1,$2,$3,now())',[p+'-'+suffix,suffix==='project'?'Retainer review':'Capacity '+suffix,p+'-'+org]);
  await db.query('INSERT INTO gc_atrium.project_client(id,"projectId","userId") VALUES($1,$2,$3)',[p+'-pc',p+'-project',p+'-client']);
  await db.query('INSERT INTO gc_atrium.time_entry(id,"organizationId","projectId","userId","startedAt","endedAt","durationSec","updatedAt") VALUES($1,$2,$3,$4,date_trunc(\'month\',now())+interval \'1 day\',date_trunc(\'month\',now())+interval \'1 day 15 hours\',54000,now())',[p+'-time',p+'-org',p+'-project',p+'-employee']);
 } else if(process.argv[2]==='cleanup') {
  await db.query('DELETE FROM gc_atrium.project WHERE id=ANY($1)',[[p+'-project',p+'-second',p+'-foreign']]);
  await db.query('DELETE FROM gc_atrium.organization WHERE id=ANY($1)',[[p+'-org',p+'-other']]);
  await db.query('DELETE FROM gc_atrium."user" WHERE id=ANY($1)',[[p+'-owner',p+'-employee',p+'-client']]);
  for(const table of ['project_budget','project_staff'])assert.equal((await db.query(`SELECT count(*)::int AS n FROM gc_atrium.${table} WHERE "projectId"=ANY($1)`,[[p+'-project',p+'-second',p+'-foreign']])).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM gc_atrium.member_capacity WHERE "memberId"=$1',[p+'-employee-member'])).rows[0].n,0);
 } else throw Error('Unknown fixture operation');
 await db.query('COMMIT');console.log(JSON.stringify({operation:process.argv[2],result:'passed',scope:'only random planning fixture IDs'}));
} catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(JSON.stringify({error:'Planning fixture failed',code:e.code??e.name}));process.exitCode=1;}finally{await db.end();}
