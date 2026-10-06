import pg from 'pg';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {supabaseConnection} from '../../supabase-config.mjs';
import {guard} from './migrate.mjs';
import {guard as atriumGuard} from '../managed-atrium/migrate.mjs';
const target=JSON.parse(readFileSync(new URL('../../targets.json',import.meta.url)));
let db;
try {
 if(process.env.SUPABASE_PROJECT_REF!==target.database.projectRef||target.database.projectIntent!=='create-dedicated-staging-project')throw Error('Dedicated staging target required');
 const config=supabaseConnection({url:readFileSync('/run/secrets/database-url','utf8').trim(),projectRef:target.database.projectRef,ca:readFileSync('/run/secrets/ca.crt','utf8')});
 config.options='-c default_transaction_read_only=off';db=new pg.Client(config);await db.connect();
 assert.equal((await db.query('SELECT current_user')).rows[0].current_user,'postgres');
 const roles=(await db.query("SELECT rolname,rolcanlogin,rolsuper,rolcreaterole,rolcreatedb,rolinherit,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname",[['gc_migrate','gc_app','gc_gateway','gc_lifecycle','gc_documenso_migrate','gc_documenso']])).rows;
 assert.equal(roles.length,6);assert(roles.every(r=>Object.entries(r).every(([k,v])=>k==='rolname'||v===false)));
 for(const role of ['gc_documenso']) {
  await db.query('BEGIN');
  try {await db.query(`SET LOCAL ROLE ${role}; SET LOCAL search_path=gc_documenso,pg_catalog`);await guard(db);}
  finally {await db.query('ROLLBACK');}
 }
 for(const role of ['gc_app','gc_gateway','gc_lifecycle']) {
  await db.query('BEGIN');
  try {await db.query(`SET LOCAL ROLE ${role}; SET LOCAL search_path=gc_atrium,pg_catalog`);await atriumGuard(db);}
  finally {await db.query('ROLLBACK');}
 }
 const denied=[];
 for(const [role,sql] of [
  ['gc_documenso','CREATE TABLE gc_documenso.runtime_escape(id int)'],
  ['gc_documenso','DELETE FROM gc_documenso._growthcast_migrations'],
  ['gc_documenso',"UPDATE gc_documenso._growthcast_schema_state SET fingerprint='invalid'"],
  ['gc_documenso','SELECT count(*) FROM gc_atrium."user"'],
  ['gc_app','SELECT count(*) FROM gc_documenso."User"'],
  ...['anon','authenticated','service_role'].map(r=>[r,'SELECT count(*) FROM gc_documenso."User"'])
 ]) {
  await db.query('BEGIN');
  try {await db.query(`SET LOCAL ROLE ${role}`);await assert.rejects(()=>db.query(sql),e=>e.code==='42501');denied.push({role,operation:sql.split(' ')[0],sqlstate:'42501'});}
  finally {await db.query('ROLLBACK');}
 }
 const relations=(await db.query("SELECT n.nspname AS schema,count(c.oid)::int AS relations FROM pg_namespace n LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relkind IN ('r','p','v','m','S','f') WHERE n.nspname IN ('gc_atrium','gc_documenso','portal_meta','portal_api','public') GROUP BY n.nspname ORDER BY n.nspname")).rows;
 assert(relations.filter(r=>['portal_api','public'].includes(r.schema)).every(r=>r.relations===0));
 assert.equal((await db.query("SELECT pg_has_role('gc_documenso','gc_documenso_migrate','MEMBER') AS allowed")).rows[0].allowed,false);
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),projectRef:target.database.projectRef,roles,relations,runtimeSchemaGuards:'passed for Documenso, Atrium app, gateway and lifecycle',denied,probeChanges:'rolled back'},null,2));
} catch {console.error('Managed staging verification failed; details suppressed');process.exitCode=1;}
finally {if(db)await db.end();}
