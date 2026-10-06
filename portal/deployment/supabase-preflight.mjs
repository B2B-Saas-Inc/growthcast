import pg from 'pg';
import {readFileSync} from 'node:fs';
import {supabaseConnection} from './supabase-config.mjs';
// Only credential-file input. Do not pass passwords on the command line.
let db;
try {
 const config=supabaseConnection({url:readFileSync('/run/secrets/database-url','utf8').trim(),projectRef:process.env.SUPABASE_PROJECT_REF,ca:process.env.SUPABASE_CA_FILE?readFileSync(process.env.SUPABASE_CA_FILE,'utf8'):undefined});
 db=new pg.Client(config);await db.connect();await db.query('BEGIN READ ONLY');
 const status=(await db.query("SELECT current_setting('server_version_num')::int AS version,current_setting('transaction_read_only') AS readonly,ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()" )).rows[0];
 const relations=(await db.query("SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')")).rows[0].count;
 const roles=(await db.query("SELECT rolname,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls,rolinherit FROM pg_roles WHERE rolname = ANY($1::text[])",[['gc_migrate','gc_app','gc_gateway','gc_lifecycle']])).rows;
 const defaults=(await db.query("SELECT count(*)::int AS count FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a LEFT JOIN pg_roles r ON r.oid=a.grantee WHERE (d.defaclnamespace=0 OR d.defaclnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')) AND (a.grantee=0 OR r.rolname IN ('anon','authenticated','service_role'))")).rows[0].count;
 await db.query('ROLLBACK');
 const blockers=[];
 if(status?.readonly!=='on'||status?.ssl!==true)blockers.push('Verified TLS/read-only session not established');
 if(Math.floor(status.version/10000)!==17)blockers.push('Database major version differs from tested PostgreSQL 17');
 if(relations)blockers.push('Public schema is occupied; do not run the existing baseline or global grants');
 if(roles.length!==4)blockers.push('Portal database roles not provisioned');
 if(roles.some(r=>r.rolsuper||r.rolcreaterole||r.rolcreatedb||r.rolbypassrls||r.rolinherit))blockers.push('Portal roles exceed intended privilege boundary');
 if(defaults)blockers.push('API/PUBLIC default privileges require review before creating portal objects');
 console.log(JSON.stringify({readOnly:true,postgresMajor:Math.floor(status.version/10000),publicRelationCount:relations,portalRoleCount:roles.length,apiOrPublicDefaultGrantCount:defaults,blockers,remaining:['Audit project identity/environment and existing workloads','Inspect Data API exposed schemas and deny anonymous/authenticated/service-role access','Verify ownership, schema guards and advisory locks on a disposable target','Confirm plan backup retention/PITR and restore database plus signed artifacts']},null,2));
 process.exitCode=blockers.length?2:0;
} catch {console.error('Supabase preflight failed; connection details and credentials suppressed.');process.exitCode=1;}
finally {if(db)await db.end();}
