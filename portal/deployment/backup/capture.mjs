import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {supabaseConnection} from '../supabase-config.mjs';
import {StorageClient} from '../storage/client.mjs';
import {guard as atriumGuard} from '../supabase/managed-atrium/migrate.mjs';
import {guard as providerGuard} from '../supabase/managed-documenso/migrate.mjs';
import {catalog} from '../managed-recovery/catalog.mjs';
import {capture,sha256,limits,readReferences} from './capture-core.mjs';
const projectRef='saedetvoolpdysiyjwvg',bucket='gc-atrium-private';
const sourceDirectory=process.env.PORTAL_CAPTURE_SOURCE || '/source';
const snapshotDirectory=process.env.PORTAL_CAPTURE_DIRECTORY || '/snapshot';
let db;
try {
  const credentials=JSON.parse(readFileSync(join(sourceDirectory,'storage-credentials.json'),'utf8'));
  assert.equal(credentials.projectRef,projectRef);assert.equal(credentials.bucket,bucket);
  assert.equal(credentials.email,'portal-backup-storage@growthcast.invalid');
  const config=supabaseConnection({url:readFileSync(join(sourceDirectory,'database-url'),'utf8').trim(),projectRef,ca:readFileSync(join(sourceDirectory,'prod-ca-2021.crt'),'utf8')});
  assert.ok(['gc_backup','gc_backup.'+projectRef].includes(config.user));
  db=new pg.Client({...config,statement_timeout:120000,query_timeout:125000});await db.connect();
  assert.equal((await db.query('SELECT current_user')).rows[0].current_user,'gc_backup');
  assert.equal((await db.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl,true);
  const storage=new StorageClient({projectRef,bucket,credentials,maxDownloadBytes:limits.objectBytes});
  const source={
    lock:async()=>(await db.query('SELECT pg_try_advisory_lock(7814206) AS locked')).rows[0].locked,
    unlock:()=>db.query('SELECT pg_advisory_unlock(7814206)'),
    begin:()=>db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'),
    commit:()=>db.query('COMMIT'),rollback:()=>db.query('ROLLBACK'),
    snapshot:async()=>(await db.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot,
    guard:async()=>{
      await db.query('SET LOCAL search_path=gc_atrium,pg_catalog');await atriumGuard(db);
      await db.query('SET LOCAL search_path=gc_documenso,pg_catalog');await providerGuard(db);
    },
    objects:async()=>(await db.query('SELECT id,bucket_id,name,metadata FROM gc_backup_meta.storage_objects ORDER BY name LIMIT $1',[limits.objects+1])).rows,
    references:()=>readReferences(db),
    catalogFormat:'bytewise-v1',
    catalog:()=>catalog(db,{bytewise:true}),
    roles:async()=>(await db.query("SELECT rolname,rolcanlogin FROM pg_roles WHERE rolname IN ('gc_migrate','gc_app','gc_gateway','gc_lifecycle','gc_documenso_migrate','gc_documenso') ORDER BY rolname")).rows,
    dump:async(snapshot,directory)=>{
      const env={PATH:process.env.PATH,PGHOST:config.host,PGPORT:'5432',PGDATABASE:'postgres',PGUSER:config.user,PGPASSWORD:config.password,
        PGSSLMODE:'verify-full',PGSSLROOTCERT:join(sourceDirectory,'prod-ca-2021.crt'),PGOPTIONS:'-c default_transaction_read_only=on',PGCONNECT_TIMEOUT:'10'};
      for(const [name,schemas] of [['atrium',['gc_atrium','portal_meta']],['documenso',['gc_documenso']]]) {
        execFileSync('pg_dump',['--format=custom','--strict-names','--snapshot='+snapshot,...schemas.map(schema=>'--schema='+schema),'-f',join(directory,name+'.dump')],{env,stdio:'pipe',timeout:120000});
      }
    },
    bundle:async(directory,objects)=>{
      const files=['atrium.dump','documenso.dump','manifest.json',...objects];
      const size=files.reduce((sum,file)=>sum+statSync(join(directory,file)).size,0);
      assert.ok(size<240*1024*1024,'Archive exceeds bounded staging capacity');
      writeFileSync(join(directory,'SHA256SUMS'),files.map(file=>sha256(readFileSync(join(directory,file)))+'  '+file).join('\n')+'\n',{flag:'wx',mode:0o600});
      // Generated content paths are fixed names or hexadecimal hashes, never object keys.
      execFileSync('tar',['-C',directory,'-cf',join(directory,'bundle.tar'),...files,'SHA256SUMS'],{stdio:'pipe',timeout:120000});
      assert.ok(statSync(join(directory,'bundle.tar')).size<256*1024*1024,'Archive exceeds encryption capacity');
    }
  };
  const result=await capture({source,storage,directory:snapshotDirectory,projectRef,bucket,storageSubject:credentials.subject});
  console.log(JSON.stringify({stage:'CAPTURED',...result}));
} catch {console.error(JSON.stringify({stage:'FAILED',category:'source-capture',details:'Sensitive diagnostics withheld'}));process.exitCode=1;}
finally {if(db)await db.end();}
