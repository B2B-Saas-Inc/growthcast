import pg from 'pg';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {supabaseConnection} from '../supabase-config.mjs';
const target=JSON.parse(readFileSync(new URL('../targets.json',import.meta.url)));
let db;
try {
  if(process.env.SUPABASE_PROJECT_REF!==target.database.projectRef||target.database.projectIntent!=='create-dedicated-staging-project')throw Error('Dedicated staging target required');
  if(!['apply','verify'].includes(process.argv[2]))throw Error('Explicit apply or verify required');
  const config=supabaseConnection({url:readFileSync('/run/secrets/database-url','utf8').trim(),projectRef:target.database.projectRef,ca:readFileSync('/run/secrets/ca.crt','utf8')});
  config.options='-c default_transaction_read_only=off';
  config.application_name='growthcast-staging-isolation';
  db=new pg.Client(config);await db.connect();
  const status=(await db.query("SELECT current_user,current_setting('server_version_num')::int AS version,ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()")).rows[0];
  if(status?.current_user!=='postgres'||Math.floor(status.version/10000)!==17||!status.ssl)throw Error('Verified PostgreSQL 17 administrator required');
  const sql=readFileSync(new URL('./isolation.sql',import.meta.url),'utf8');
  const checks=readFileSync(new URL('./isolation-check.sql',import.meta.url),'utf8');
  if(process.argv[2]==='apply')await db.query(sql);
  await db.query(checks);
  const roles=(await db.query("SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname",[['gc_migrate','gc_app','gc_gateway','gc_lifecycle','gc_documenso_migrate','gc_documenso']])).rows;
  const schemas=(await db.query("SELECT nspname,pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname=ANY($1::text[]) ORDER BY nspname",[['gc_atrium','gc_documenso','portal_meta','portal_api']])).rows;
  const objects=(await db.query("SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1::text[])",[['gc_atrium','gc_documenso','portal_meta','portal_api']])).rows[0].count;
  if(roles.length!==6||schemas.length!==4||objects!==0||roles.some(r=>r.rolcanlogin||r.rolsuper||r.rolcreatedb||r.rolcreaterole||r.rolinherit||r.rolreplication||r.rolbypassrls))throw Error('Unexpected isolation catalog');
  const owners={gc_atrium:'gc_migrate',gc_documenso:'gc_documenso_migrate',portal_meta:'gc_migrate',portal_api:'postgres'};
  if(schemas.some(s=>owners[s.nspname]!==s.owner))throw Error('Unexpected schema ownership');
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),projectRef:target.database.projectRef,operation:process.argv[2],verifiedTls:true,isolationSqlSha256:createHash('sha256').update(sql).digest('hex'),checksSha256:createHash('sha256').update(checks).digest('hex'),roles,schemas,remainingRelationCount:objects,permissionProbes:'passed; all probe objects rolled back',applicationMigrationsApplied:false},null,2));
} catch(error) {
  if(db)await db.query('ROLLBACK').catch(()=>{});
  console.error(JSON.stringify({error:'Isolation operation failed; credential details suppressed',code:/^[A-Z0-9_]{3,40}$/.test(error.code??'')?error.code:undefined}));process.exitCode=1;
} finally {if(db)await db.end();}
