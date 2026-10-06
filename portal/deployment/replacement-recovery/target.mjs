import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {randomBytes,createHash} from 'node:crypto';
import {supabaseConnection} from '../supabase-config.mjs';
import {catalog} from '../managed-recovery/catalog.mjs';
import {guard as atriumGuard} from '../supabase/managed-atrium/migrate.mjs';
import {guard as providerGuard} from '../supabase/managed-documenso/migrate.mjs';
const raw=readFileSync('/target/settings.json');assert.match(process.env.RECOVERY_CONFIG_SHA256??'',/^[a-f0-9]{64}$/);assert.equal(createHash('sha256').update(raw).digest('hex'),process.env.RECOVERY_CONFIG_SHA256,'Immutable recovery configuration required');
const settings=JSON.parse(raw);
const source='saedetvoolpdysiyjwvg';
assert.match(settings.projectRef,/^[a-z]{20}$/);assert.notEqual(settings.projectRef,source);assert.equal(settings.intent,'temporary-replacement-recovery');
const config=supabaseConnection({url:settings.databaseUrl,projectRef:settings.projectRef,ca:readFileSync('/target/ca.crt','utf8')});
assert.equal(config.user,'postgres.'+settings.projectRef);config.options='-c default_transaction_read_only=off';config.statement_timeout=120000;config.query_timeout=150000;
const db=new pg.Client(config);process.umask(0o077);let step=process.argv[2];
try {
 await db.connect();const status=(await db.query("SELECT current_user,ssl,current_setting('server_version_num')::int AS version FROM pg_stat_ssl WHERE pid=pg_backend_pid()")).rows[0];assert.equal(status.current_user,'postgres');assert.equal(status.ssl,true);assert.equal(Math.floor(status.version/10000),17);
 if(process.argv[2]==='restore'){
  // A duplicate run must fail before any schema or data changes.
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_namespace WHERE nspname IN ('gc_atrium','gc_documenso','portal_meta','portal_api')")).rows[0].n,0,'Empty replacement target required');
  const manifest=JSON.parse(readFileSync('/restored/manifest.json','utf8'));assert.equal(manifest.projectRef,source);assert.equal(manifest.schemaVersion,2);
  execFileSync('sh',['-ec','cd /restored && sha256sum -c SHA256SUMS'],{stdio:'pipe'});
  await db.query(readFileSync(new URL('../supabase/isolation.sql',import.meta.url),'utf8'));
  await db.query('CREATE ROLE gc_backup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions; CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions; GRANT USAGE ON SCHEMA extensions TO gc_documenso_migrate,gc_documenso;');
  const env={PATH:process.env.PATH,PGHOST:config.host,PGPORT:'5432',PGDATABASE:'postgres',PGUSER:config.user,PGPASSWORD:config.password,PGSSLMODE:'verify-full',PGSSLROOTCERT:'/target/ca.crt'};
  for(const name of ['atrium','documenso']){
   const list=execFileSync('pg_restore',['--list','/restored/'+name+'.dump'],{encoding:'utf8'}).split('\n').filter(line=>!/^\d+; \d+ \d+ SCHEMA - (gc_atrium|gc_documenso|portal_meta) /.test(line)).join('\n');
   writeFileSync('/tmp/'+name+'.list',list,{mode:0o600});
   execFileSync('pg_restore',['--role='+ (name==='atrium'?'gc_migrate':'gc_documenso_migrate'),'--no-owner','--use-list=/tmp/'+name+'.list','--exit-on-error','--single-transaction','-d','postgres','/restored/'+name+'.dump'],{env,stdio:'pipe',timeout:180000});
  }
  console.log(JSON.stringify({stage:'RESTORED',projectRef:settings.projectRef,verifiedTls:true}));
 } else if(process.argv[2]==='verify'){
  const manifest=JSON.parse(readFileSync('/restored/manifest.json','utf8'));
  await db.query('GRANT gc_migrate,gc_documenso_migrate TO postgres WITH INHERIT TRUE, SET TRUE');
  try{assert.deepEqual(await catalog(db),manifest.tables);}finally{await db.query('GRANT gc_migrate,gc_documenso_migrate TO postgres WITH INHERIT FALSE, SET TRUE');}
  const roles=(await db.query("SELECT rolname,rolcanlogin FROM pg_roles WHERE rolname LIKE 'gc_%' ORDER BY rolname")).rows;
  assert.equal(roles.length,7);assert.ok(roles.every(r=>!r.rolcanlogin));
  for(const [role,schema,guard,denials] of [
   ['gc_app','gc_atrium',atriumGuard,['CREATE TABLE gc_atrium.restore_escape(id int)','DELETE FROM portal_meta.migrations','SET ROLE gc_migrate','SELECT * FROM gc_documenso."User"']],
   ['gc_documenso','gc_documenso',providerGuard,['CREATE TABLE gc_documenso.restore_escape(id int)','DELETE FROM _growthcast_migrations','SET ROLE gc_documenso_migrate','SELECT * FROM gc_atrium."user"']]
  ]){
   const password=randomBytes(32).toString('hex');await db.query(`ALTER ROLE ${role} LOGIN PASSWORD '${password}'`);
   const scoped=new pg.Client({...config,user:role+'.'+settings.projectRef,password,options:'-c search_path='+schema+',pg_catalog'});
   try{await scoped.connect();await guard(scoped);for(const sql of denials)await assert.rejects(()=>scoped.query(sql),e=>e.code==='42501');}
   finally{await scoped.end();await db.query(`ALTER ROLE ${role} NOLOGIN PASSWORD NULL`);}
  }
  for(const role of ['anon','authenticated','service_role'])for(const schema of ['gc_atrium','gc_documenso','portal_meta'])assert.equal((await db.query('SELECT has_schema_privilege($1,$2,\'USAGE\') AS allowed',[role,schema])).rows[0].allowed,false);
  console.log(JSON.stringify({stage:'VERIFIED',projectRef:settings.projectRef,tables:manifest.tables.length,rows:manifest.tables.reduce((n,t)=>n+t.count,0),verifiedTls:true,ownersAndAcls:true,bothGuards:true,roleAndApiDenials:true,applicationLoginsDisabled:true}));
 } else if(process.argv[2].startsWith('runtime-')){
  const {runtimeOperation}=await import('./runtime-target.mjs');
  console.log(JSON.stringify(await runtimeOperation(db,settings,process.argv[2])));
 } else if(process.argv[2]==='storage-policies'){
  await db.query('BEGIN');await db.query("SELECT set_config('growthcast.storage_subject',$1,true),set_config('growthcast.backup_storage_subject',$2,true)",[settings.writer.subject,settings.reader.subject]);
  step='storage-base';await db.query(readFileSync(new URL('../storage/policy.sql',import.meta.url),'utf8'));step='storage-reader';await db.query(readFileSync(new URL('../storage/backup-policy.sql',import.meta.url),'utf8'));await db.query('COMMIT');
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND (policyname LIKE 'gc_atrium_%' OR policyname LIKE 'gc_backup_%')")).rows[0].n,9);
  console.log(JSON.stringify({stage:'POLICIES',count:9}));
 } else if(process.argv[2]==='storage-check'){
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND (policyname LIKE 'gc_atrium_%' OR policyname LIKE 'gc_backup_%')")).rows[0].n,9);
  console.log(JSON.stringify({stage:'POLICIES',count:9}));
 } else throw Error('Explicit operation required');
} catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(JSON.stringify({stage:'FAILED',code:/^[A-Z0-9_]{3,40}$/.test(e.code??'')?e.code:undefined,category:step,check:['Storage RLS required','Private dedicated bucket required','Existing policy requires explicit review; refusing overwrite','Original isolation policy differs from reviewed boundary','Unexpected policy inventory; refusing upgrade'].find(message=>e.message===message)}));process.exitCode=1;}
finally{await db.end();}
