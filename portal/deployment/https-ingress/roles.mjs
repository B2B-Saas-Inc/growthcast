import pg from 'pg';
import {readFileSync} from 'node:fs';
import {supabaseConnection} from '../supabase-config.mjs';
const roles=['gc_app','gc_migrate','gc_gateway','gc_lifecycle','gc_documenso','gc_documenso_migrate'];
const config=supabaseConnection({projectRef:'saedetvoolpdysiyjwvg',url:readFileSync('/source/database-url','utf8').trim(),ca:readFileSync('/source/prod-ca-2021.crt','utf8')});
const db=new pg.Client(config);
try{await db.connect();const {rows}=await db.query('SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=ANY($1) ORDER BY rolname',[roles]);if(rows.length!==roles.length||rows.some(r=>r.rolcanlogin!==(r.rolname==='gc_app')||r.rolsuper||r.rolcreatedb||r.rolcreaterole||r.rolreplication||r.rolbypassrls))throw Error('Role mismatch');console.log(JSON.stringify({result:'passed',roles:rows}));}catch{console.error('Staging role audit failed; details suppressed');process.exitCode=1;}finally{await db.end();}
