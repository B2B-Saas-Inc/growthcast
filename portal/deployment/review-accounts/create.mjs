import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from '/boundary/node_modules/pg/lib/index.js';
import {hashPassword} from '/upstream/apps/api/node_modules/better-auth/dist/crypto/index.mjs';
import {supabaseConnection} from '/boundary/deployment/supabase-config.mjs';
const material=JSON.parse(readFileSync('/private/connection.json','utf8'));
const input=JSON.parse(readFileSync('/private/accounts.json','utf8'));
const p=input.prefix;assert.match(p,/^review-[a-f0-9]{16}$/);
assert(input.admin.email==='ewhite@growthcast.app'&&input.client.email==='ewhite+client@growthcast.app');
const config=supabaseConnection({projectRef:material.projectRef,url:material.databaseUrl,ca:material.databaseCa});assert(config.user==='gc_app.'+material.projectRef);config.options='';
const db=new pg.Client(config);
try{
 await db.connect();await db.query('BEGIN READ WRITE');
 assert.equal((await db.query('SELECT id FROM gc_atrium."user" WHERE email=ANY($1)',[[input.admin.email,input.client.email]])).rowCount,0,'Existing accounts require reconciliation; never overwrite passwords');
 await db.query('INSERT INTO gc_atrium.organization(id,name,slug,"setupCompleted","updatedAt") VALUES($1,\'GrowthCast\',\'growthcast-review\',true,now())',[p+'-org']);
 for(const [key,role,name] of [['admin','owner','GrowthCast Admin'],['client','member','GrowthCast Test Client']]){
  const id=p+'-'+key;const hash=await hashPassword(input[key].password);
  await db.query('INSERT INTO gc_atrium."user"(id,name,email,"emailVerified","updatedAt") VALUES($1,$2,$3,true,now())',[id,name,input[key].email]);
  await db.query('INSERT INTO gc_atrium.account(id,"accountId","providerId","userId",password,"updatedAt") VALUES($1,$2,\'credential\',$2,$3,now())',[id+'-account',id,hash]);
  await db.query('INSERT INTO gc_atrium.member(id,"organizationId","userId",role) VALUES($1,$2,$3,$4)',[id+'-member',p+'-org',id,role]);
 }
 // Mirror normal organization creation: status controls require these rows.
 for (const [order, [name, slug, color]] of [['Not Started','not_started','#6b7280'],['In Progress','in_progress','#3b82f6'],['In Review','in_review','#f59e0b'],['Completed','completed','#10b981']].entries()) {
  await db.query('INSERT INTO gc_atrium.project_status(id,name,slug,color,"order","organizationId") VALUES($1,$2,$3,$4,$5,$6)',[p+'-status-'+slug,name,slug,color,order,p+'-org']);
 }
 await db.query('INSERT INTO gc_atrium.system_settings(id,"organizationId","setupCompleted","telemetryEnabled","maxFileSizeMb","updatedAt") VALUES($1,$2,true,false,3,now())',[p+'-settings',p+'-org']);
 await db.query('INSERT INTO gc_atrium.branding(id,"organizationId","logoUrl","primaryColor","accentColor","updatedAt") VALUES($1,$2,\'https://clients.staging.growthcast.app/growthcast-wordmark.png\',\'#242426\',\'#ff6b4a\',now())',[p+'-branding',p+'-org']);
 await db.query('INSERT INTO gc_atrium.project(id,name,description,status,"organizationId","updatedAt") VALUES($1,\'Your growth roadmap\',\'A sample project for exploring your GrowthCast client portal. All content is for review.\',\'in_progress\',$2,now()),($3,\'Internal planning\',\'Admin-only sample project to verify client isolation.\',\'not_started\',$2,now())',[p+'-project',p+'-org',p+'-internal']);
 await db.query('INSERT INTO gc_atrium.project_client(id,"projectId","userId") VALUES($1,$2,$3)',[p+'-assignment',p+'-project',p+'-client']);
 await db.query('INSERT INTO gc_atrium.project_update(id,content,"projectId","organizationId","authorId") VALUES($1,$2,$3,$4,$5)',[p+'-update','Welcome to your GrowthCast portal. This sample workspace brings your projects, next steps, and shared files together. Try the Updates, Tasks, and Files tabs to explore.',p+'-project',p+'-org',p+'-admin']);
 for(const [suffix,title,status] of [['kickoff','Review your growth priorities','open'],['workspace','Explore your project workspace','done']]){
  await db.query('INSERT INTO gc_atrium.task(id,title,status,"projectId","organizationId","requestedById","assigneeId","updatedAt") VALUES($1,$2,$3,$4,$5,$6,$7,now())',[p+'-'+suffix,title,status,p+'-project',p+'-org',p+'-admin',p+'-client']);
 }
 await db.query('COMMIT');console.log(JSON.stringify({result:'created',organizationId:p+'-org',adminRole:'owner',clientRole:'member',assignedProject:p+'-project',unassignedProject:p+'-internal',notificationEmailsSent:0}));
}catch(error){await db.query('ROLLBACK').catch(()=>{});console.error(JSON.stringify({failure:'review-account-provisioning',code:error.code??error.name}));process.exitCode=1;}finally{await db.end();}
