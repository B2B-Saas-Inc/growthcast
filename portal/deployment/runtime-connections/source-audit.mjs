import pg from 'pg';
import {readFileSync} from 'node:fs';
import {supabaseConnection} from '../supabase-config.mjs';
let db;
try {
 db=new pg.Client(supabaseConnection({projectRef:'saedetvoolpdysiyjwvg',url:readFileSync('/source/database-url','utf8').trim(),ca:readFileSync('/source/prod-ca-2021.crt','utf8')}));
 await db.connect();await db.query('BEGIN READ ONLY');
 const roles=['gc_migrate','gc_app','gc_gateway','gc_lifecycle','gc_documenso_migrate','gc_documenso'];
 const result=await db.query('SELECT rolname,rolcanlogin FROM pg_roles WHERE rolname=ANY($1)',[roles]);
 if(result.rows.length!==6 || result.rows.some(row=>row.rolcanlogin))throw Error('Unexpected runtime login');
 await db.query('ROLLBACK');console.log(JSON.stringify({checkedAt:new Date().toISOString(),result:'passed',projectRef:'saedetvoolpdysiyjwvg',disabledRoles:roles,readOnlyAudit:true}));
}catch{console.error('Source login audit failed; details suppressed');process.exitCode=1;}
finally{await db?.end();}
