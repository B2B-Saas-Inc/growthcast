import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {supabaseConnection} from '../supabase-config.mjs';
import {StorageClient} from '../storage/client.mjs';
import {guard as atriumGuard} from '../supabase/managed-atrium/migrate.mjs';
import {guard as providerGuard} from '../supabase/managed-documenso/migrate.mjs';
import {catalog} from './catalog.mjs';
const projectRef='saedetvoolpdysiyjwvg',bucket='gc-atrium-private';
const backupIdentity=process.env.PORTAL_BACKUP_DATABASE==='1';
const objectTable=backupIdentity?'gc_backup_meta.storage_objects':'storage.objects';
const credentials=JSON.parse(readFileSync('/source/storage-credentials.json','utf8'));
assert.equal(credentials.projectRef,projectRef);assert.equal(credentials.bucket,bucket);
const storage=new StorageClient({projectRef,bucket,credentials});
const config=supabaseConnection({url:readFileSync('/source/database-url','utf8').trim(),projectRef,ca:readFileSync('/source/prod-ca-2021.crt','utf8')});
const db=new pg.Client({...config,statement_timeout:60000,query_timeout:65000});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
try {
  await db.connect();
  assert.equal((await db.query('SELECT current_user')).rows[0].current_user,backupIdentity?'gc_backup':'postgres');
  assert.equal((await db.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl,true);
  const roles=(await db.query("SELECT rolname,rolcanlogin FROM pg_roles WHERE rolname IN ('gc_migrate','gc_app','gc_gateway','gc_lifecycle','gc_documenso_migrate','gc_documenso') ORDER BY rolname")).rows;
  assert.equal(roles.length,6);assert.ok(roles.every(role=>!role.rolcanlogin));
  assert.equal((await db.query('SELECT count(*)::int AS count FROM pg_stat_activity WHERE usename = ANY($1::text[])',[roles.map(role=>role.rolname)])).rows[0].count,0,'No active portal database sessions permitted');
  const {key}=JSON.parse(readFileSync('/journal/object.json','utf8'));
  assert.match(key,/^recovery\/[a-f0-9-]{36}\.txt$/);
  const bytes=Buffer.from('Synthetic live Supabase recovery artifact.\n');
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const snapshot=(await db.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
  assert.match(snapshot,/^[A-F0-9-]+$/);
  const objects=(await db.query(`SELECT id,bucket_id,name,metadata FROM ${objectTable} WHERE bucket_id=$1 ORDER BY name`,[bucket])).rows;
  assert.equal(objects.length,1);assert.equal(objects[0].name,key);
  const recovered=await storage.download(key);assert.deepEqual(recovered.bytes,bytes);
  writeFileSync('/snapshot/object.bin',recovered.bytes);
  const rows=await catalog(db);
  await db.query('SET search_path=gc_atrium,pg_catalog');await atriumGuard(db);
  await db.query('SET search_path=gc_documenso,pg_catalog');await providerGuard(db);
  const env={PATH:process.env.PATH,PGHOST:config.host,PGPORT:'5432',PGDATABASE:'postgres',PGUSER:config.user,PGPASSWORD:config.password,
    PGSSLMODE:'verify-full',PGSSLROOTCERT:'/source/prod-ca-2021.crt',PGOPTIONS:'-c default_transaction_read_only=on',PGCONNECT_TIMEOUT:'10'};
  for (const [name,role,schemas] of [['atrium','gc_migrate',['gc_atrium','portal_meta']],['documenso','gc_documenso_migrate',['gc_documenso']]]) {
    execFileSync('pg_dump',['--format=custom','--strict-names','--snapshot='+snapshot,...(backupIdentity?[]:['--role='+role]),...schemas.map(schema=>'--schema='+schema),'-f','/snapshot/'+name+'.dump'],{env,stdio:'pipe',timeout:120000});
  }
  await db.query('COMMIT');
  const after=(await db.query(`SELECT id,bucket_id,name,metadata FROM ${objectTable} WHERE bucket_id=$1 ORDER BY name`,[bucket])).rows;
  assert.deepEqual(after,objects,'Storage metadata changed during capture');
  assert.equal(hash((await storage.download(key)).bytes),hash(bytes));
  assert.deepEqual(await catalog(db),rows,'Private data changed during capture');
  writeFileSync('/snapshot/manifest.json',JSON.stringify({projectRef,bucket,storageSubject:credentials.subject,databaseIdentity:backupIdentity?'gc_backup':'postgres',roles,tables:rows,objects,objectSha256:hash(bytes),objectBytes:bytes.length},null,2));
  execFileSync('sh',['-ec','cd /snapshot; sha256sum atrium.dump documenso.dump manifest.json object.bin > SHA256SUMS; tar -cf bundle.tar atrium.dump documenso.dump manifest.json object.bin SHA256SUMS'],{stdio:'pipe'});
  console.log('Live TLS read-only snapshot captured both private applications, migration metadata and one bound storage object.');
} catch { console.error('Managed source capture failed; sensitive diagnostic output withheld.');process.exitCode=1; }
finally {await db.end();}
