import pg from 'pg';
import {readFileSync,existsSync} from 'node:fs';
import {supabaseConnection} from '../../supabase-config.mjs';
import {migrate,guard,files,hash} from './migrate.mjs';
const target=JSON.parse(readFileSync(new URL('../../targets.json',import.meta.url)));
let db;
try {
 if(process.env.SUPABASE_PROJECT_REF!==target.database.projectRef||target.database.projectIntent!=='create-dedicated-staging-project'||existsSync('/run/secrets/admin-url'))throw Error('Isolated dedicated staging migration required');
 const config=supabaseConnection({url:readFileSync('/run/secrets/database-url','utf8').trim(),projectRef:target.database.projectRef,ca:readFileSync('/run/secrets/ca.crt','utf8')});
 if(!config.user.startsWith('gc_documenso_migrate'))throw Error('Migration credential required');
 config.options='-c default_transaction_read_only=off';config.application_name='growthcast-managed-documenso-migration';
 db=new pg.Client(config);await db.connect();
 const status=(await db.query("SELECT current_user,current_setting('server_version_num')::int AS version,ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()")).rows[0];
 if(status.current_user!=='gc_documenso_migrate'||Math.floor(status.version/10000)!==17||!status.ssl)throw Error('Verified migration identity required');
 await migrate(db);await migrate(db);await guard(db);
 const entries=await files();
 const apiGrants=(await db.query("SELECT count(*)::int AS count FROM pg_roles r CROSS JOIN pg_namespace n WHERE r.rolname IN ('anon','authenticated','service_role') AND n.nspname IN ('gc_documenso','portal_meta','gc_documenso') AND has_schema_privilege(r.oid,n.oid,'USAGE')")).rows[0].count;
 if(apiGrants!==0)throw Error('Unexpected API schema access');
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),projectRef:target.database.projectRef,namespace:'gc_documenso',fingerprintVersion:(await db.query('SELECT fingerprint_version FROM _growthcast_schema_state WHERE id=1')).rows[0].fingerprint_version,verifiedTls:true,migrationIdentity:status.current_user,migrations:entries.map(({name,sha256})=>({name,sha256})),manifestSha256:hash(readFileSync(new URL('./manifest.json',import.meta.url))),secondApplication:'no-op',schemaGuard:'passed',apiPrivateSchemaGrants:apiGrants,documensoMigrationsApplied:true},null,2));
} catch(e) {console.error(JSON.stringify({error:'Managed provider migration failed; details suppressed',code:/^[A-Z0-9_]{3,40}$/.test(e.code??'')?e.code:undefined}));process.exitCode=1;}
finally {if(db)await db.end();}
