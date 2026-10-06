import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import pg from '/boundary/node_modules/pg/lib/index.js';
import {supabaseConnection} from '/boundary/deployment/supabase-config.mjs';
const s=JSON.parse(readFileSync('/private/connection.json','utf8'));const config=supabaseConnection({projectRef:s.projectRef,url:s.databaseUrl,ca:s.databaseCa});if(config.user!=='gc_app.saedetvoolpdysiyjwvg')throw Error('Restricted staging identity required');config.options='';const db=new pg.Client(config);
const org='review-a40f59d0c00e6dc6-org';
const defaults=[['Not Started','not_started','#6b7280'],['In Progress','in_progress','#3b82f6'],['In Review','in_review','#f59e0b'],['Completed','completed','#10b981']];
try {await db.connect();await db.query('BEGIN');await db.query('SELECT id FROM gc_atrium.organization WHERE id=$1 FOR UPDATE',[org]);
const owner=(await db.query(`SELECT count(*)::int AS n FROM gc_atrium.member m JOIN gc_atrium."user" u ON u.id=m."userId" WHERE m."organizationId"=$1 AND m.role='owner' AND u.email='ewhite@growthcast.app'`,[org])).rows[0].n;if(owner!==1)throw Error('Owner mismatch');
const existing=(await db.query('SELECT slug FROM gc_atrium.project_status WHERE "organizationId"=$1',[org])).rows;
if(existing.length!==0)throw Error('Status options already exist; refuse to overwrite');
for(const [order,[name,slug,color]] of defaults.entries())await db.query('INSERT INTO gc_atrium.project_status(id,name,slug,color,"order","organizationId") VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),name,slug,color,order,org]);
await db.query('COMMIT');console.log(JSON.stringify({result:'repaired',organizationId:org,statuses:defaults.map(x=>x[0]),projectRowsChanged:0}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(JSON.stringify({error:'Scoped status repair failed',code:e.code??e.name}));process.exitCode=1;}finally{await db.end()}
