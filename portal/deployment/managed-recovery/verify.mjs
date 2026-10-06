import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {catalog} from './catalog.mjs';
import {verifyObjects} from '../backup/restore-objects.mjs';
import {guard as atriumGuard} from '../supabase/managed-atrium/migrate.mjs';
import {guard as providerGuard} from '../supabase/managed-documenso/migrate.mjs';
const manifest=JSON.parse(readFileSync('/restored/manifest.json','utf8'));
let objectResult;
if(manifest.schemaVersion===2) objectResult=verifyObjects(manifest,'/restored','/objects',process.argv[2]==='restore-object');
else {
assert.equal(manifest.projectRef,'saedetvoolpdysiyjwvg');assert.equal(manifest.objects.length,1);
const object=manifest.objects[0];assert.match(object.name,/^recovery\/[a-f0-9-]{36}\.txt$/);
assert.equal(object.bucket_id,manifest.bucket);
const path='/objects/'+object.name;
if (process.argv[2]==='restore-object') {
  assert.ok(!existsSync(path),'Object target must be empty');
  mkdirSync('/objects/recovery',{recursive:true,mode:0o700});
  writeFileSync(path,readFileSync('/restored/object.bin'),{flag:'wx',mode:0o600});
}
const bytes=readFileSync(path);
assert.equal(bytes.length,manifest.objectBytes);assert.equal(bytes.length,Number(object.metadata.size));
assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.objectSha256);
objectResult={objects:1,bytes:bytes.length};
}
const db=new pg.Client({host:process.env.PGHOST??'target',user:'postgres',database:'restored_portal'});
try {
  await db.connect();
  assert.ok(manifest.catalogFormat===undefined || manifest.catalogFormat==='bytewise-v1','Unsupported backup catalog format');
  const tables=await catalog(db,{bytewise:manifest.catalogFormat==='bytewise-v1'});
  assert.equal(tables.length,manifest.tables.length);
  for (const [index,table] of tables.entries()) assert.ok(JSON.stringify(table)===JSON.stringify(manifest.tables[index]),'Restore catalog mismatch: '+table.schema+'.'+table.name);
  const roles=(await db.query("SELECT rolname,rolcanlogin FROM pg_roles WHERE rolname IN ('gc_migrate','gc_app','gc_gateway','gc_lifecycle','gc_documenso_migrate','gc_documenso') ORDER BY rolname")).rows;
  assert.deepEqual(roles.map(role=>role.rolname),manifest.roles.map(role=>role.rolname));
  assert.ok(roles.every(role=>!role.rolcanlogin),'Restored runtime logins must remain disabled');
  await db.query('SET SESSION AUTHORIZATION gc_app; SET search_path=gc_atrium,pg_catalog');await atriumGuard(db);
  assert.equal((await db.query('SELECT session_user')).rows[0].session_user,'gc_app');
  for(const sql of ['CREATE TABLE gc_atrium.restore_escape(id int)','DELETE FROM portal_meta.migrations','SET ROLE gc_migrate','SELECT * FROM gc_documenso."User"'])await assert.rejects(()=>db.query(sql),error=>error.code==='42501');
  await db.query('RESET SESSION AUTHORIZATION; SET SESSION AUTHORIZATION gc_documenso; SET search_path=gc_documenso,pg_catalog');await providerGuard(db);
  assert.equal((await db.query('SELECT session_user')).rows[0].session_user,'gc_documenso');
  for(const sql of ['CREATE TABLE gc_documenso.restore_escape(id int)','DELETE FROM _growthcast_migrations','SET ROLE gc_documenso_migrate','SELECT * FROM gc_atrium."user"'])await assert.rejects(()=>db.query(sql),error=>error.code==='42501');
  await db.query('RESET SESSION AUTHORIZATION');
  for(const role of ['anon','authenticated','service_role'])for(const schema of ['gc_atrium','gc_documenso','portal_meta'])assert.equal((await db.query('SELECT has_schema_privilege($1,$2,\'USAGE\') AS allowed',[role,schema])).rows[0].allowed,false);
  console.log('Live-source row digests/counts, ownership/ACLs, both guards, role/API denials and storage metadata/byte binding verified.');
  console.log(JSON.stringify({verifiedTables:tables.length,verifiedRows:tables.reduce((sum,table)=>sum+table.count,0),verifiedObjects:objectResult.objects,objectBytes:objectResult.bytes}));
} finally {await db.end();}
