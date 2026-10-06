import pg from 'pg';
import {readFileSync} from 'node:fs';
import {supabaseConnection} from '../supabase-config.mjs';
const roles=['gc_app','gc_documenso'];
const mode=process.argv[2];
let db;
try {
 if(!['initialize','enable','disable'].includes(mode))throw Error('Unsupported action');
 const config=supabaseConnection({projectRef:'saedetvoolpdysiyjwvg',url:readFileSync('/source/database-url','utf8').trim(),ca:readFileSync('/source/prod-ca-2021.crt','utf8')});
 // Administrative provisioning explicitly owns a write transaction; do not
 // inherit the shared preflight helper's read-only session default.
 config.options='';
 db=new pg.Client(config);await db.connect();await db.query('BEGIN READ WRITE');await db.query('SELECT pg_advisory_xact_lock(7814213)');
 const status=await db.query('SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=ANY($1)',[roles]);
 if(status.rows.length!==2 || status.rows.some(r=>r.rolsuper||r.rolcreatedb||r.rolcreaterole||r.rolreplication||r.rolbypassrls))throw Error('Restricted runtime roles required');
 if(mode!=='disable' && status.rows.some(r=>r.rolcanlogin))throw Error('Expected disabled runtime roles');
 if(mode==='initialize') {
  const passwords=JSON.parse(readFileSync('/input/passwords.json','utf8'));
  await db.query("SET LOCAL password_encryption='scram-sha-256'");
  for(const role of roles) {
   if(!/^[a-f0-9]{64}$/.test(passwords[role]??''))throw Error('Generated password required');
   await db.query(`ALTER ROLE ${role} NOLOGIN PASSWORD '${passwords[role]}'`);
  }
 } else for(const role of roles)await db.query(`ALTER ROLE ${role} ${mode==='enable'?'LOGIN':'NOLOGIN'}`);
 await db.query('COMMIT');
 console.log(JSON.stringify({stage:'VERIFIED',action:mode,roles,login:mode==='enable'}));
}catch{console.error('Runtime database credential operation refused; details suppressed');process.exitCode=1;}
finally{if(db)await db.end();}
