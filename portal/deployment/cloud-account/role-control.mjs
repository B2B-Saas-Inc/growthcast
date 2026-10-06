import pg from 'pg';
import {readFileSync} from 'node:fs';
import {supabaseConnection} from '../supabase-config.mjs';
const roles=['gc_app'];
const mode=process.argv[2];
let db;
try {
 if(!['enable','disable'].includes(mode))throw Error('Unsupported action');
 const config=supabaseConnection({projectRef:'saedetvoolpdysiyjwvg',url:readFileSync('/source/database-url','utf8').trim(),ca:readFileSync('/source/prod-ca-2021.crt','utf8')});
 // Administrative provisioning explicitly owns a write transaction; do not
 // inherit the shared preflight helper's read-only session default.
 config.options='';
 db=new pg.Client(config);await db.connect();await db.query('BEGIN READ WRITE');await db.query('SELECT pg_advisory_xact_lock(7814213)');
 const status=await db.query('SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=ANY($1)',[roles]);
 if(status.rows.length!==1 || status.rows.some(r=>r.rolsuper||r.rolcreatedb||r.rolcreaterole||r.rolreplication||r.rolbypassrls))throw Error('Restricted runtime roles required');
 if(mode!=='disable' && status.rows.some(r=>r.rolcanlogin))throw Error('Expected disabled runtime roles');
 for(const role of roles)await db.query(`ALTER ROLE ${role} ${mode==='enable'?'LOGIN':'NOLOGIN'}`);
 await db.query('COMMIT');
 console.log(JSON.stringify({stage:'VERIFIED',action:mode,roles,login:mode==='enable'}));
}catch{console.error('Runtime database credential operation refused; details suppressed');process.exitCode=1;}
finally{if(db)await db.end();}
