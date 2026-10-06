import pg from 'pg';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {supabaseConnection} from '../supabase-config.mjs';
const ref = 'saedetvoolpdysiyjwvg';
const subject = process.env.STORAGE_SUBJECT;
const reader = process.env.BACKUP_STORAGE_SUBJECT;
let db;
try {
  if (!/^[a-f0-9-]{36}$/.test(reader??'') || !/^[a-f0-9-]{36}$/.test(subject??'')) throw Error('Explicit actor required');
  const config = supabaseConnection({projectRef:ref,url:readFileSync('/run/secrets/database-url','utf8').trim(),ca:readFileSync('/run/secrets/ca.crt','utf8')});
  if (config.user !== 'postgres.'+ref && config.user !== 'postgres') throw Error('Provisioning identity required');
  config.options='-c default_transaction_read_only=off';
  db = new pg.Client(config); await db.connect();
  const sql = readFileSync(new URL('./backup-policy.sql',import.meta.url),'utf8');
  await db.query('BEGIN');
  await db.query("SELECT pg_advisory_xact_lock(7814204),set_config('growthcast.storage_subject',$1,true)",[subject]);
  await db.query("SELECT set_config('growthcast.backup_storage_subject',$1,true)",[reader]);
  await db.query(sql);
  await db.query('COMMIT');
  const policies = (await db.query("SELECT policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND (policyname LIKE 'gc_atrium_%' OR policyname LIKE 'gc_backup_%') ORDER BY policyname")).rows;
  const bucket = (await db.query("SELECT id,public,file_size_limit FROM storage.buckets WHERE id='gc-atrium-private'")).rows[0];
  const logins = (await db.query("SELECT rolname,rolcanlogin FROM pg_roles WHERE rolname IN ('gc_app','gc_gateway','gc_lifecycle','gc_documenso','gc_migrate','gc_documenso_migrate') ORDER BY rolname")).rows;
  if (policies.length!==9 || bucket.public || logins.length!==6 || logins.some(row=>row.rolcanlogin)) throw Error('Provisioning verification failed');
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),projectRef:ref,serviceSubject:subject,backupSubject:reader,policySha256:createHash('sha256').update(sql).digest('hex'),policies,bucket,applicationLogins:logins},null,2));
} catch {console.error('Storage policy provisioning failed; details suppressed');process.exitCode=1;}
finally {if(db)await db.end();}
