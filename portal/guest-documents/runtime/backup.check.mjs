// Disposable local recovery-role check; never provision roles in application startup.
import assert from 'node:assert/strict';
import {connect} from '/foundation/db.mjs';
import {readReferences} from '/backup/capture-core.mjs';
const db=connect('postgres');await db.connect();
try {
 if(process.argv[2]==='provision') {
  await db.query(`CREATE ROLE gc_backup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
   SET ROLE gc_migrate; GRANT USAGE ON SCHEMA gc_atrium,portal_meta TO gc_backup;
   ALTER DEFAULT PRIVILEGES IN SCHEMA gc_atrium,portal_meta GRANT SELECT ON TABLES TO gc_backup; RESET ROLE`);
 } else {
  await db.query('SET SESSION AUTHORIZATION gc_backup');
  const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='gc_atrium' AND tablename LIKE 'guest_%' ORDER BY tablename")).rows;
  assert.equal(tables.length,18);
  for(const {tablename} of tables){
   await db.query('SELECT * FROM gc_atrium.'+tablename+' LIMIT 1');
   await assert.rejects(()=>db.query('DELETE FROM gc_atrium.'+tablename+' WHERE false'),e=>e.code==='42501');
  }
  await readReferences(db);
  await assert.rejects(()=>db.query('SET ROLE gc_app'),e=>e.code==='42501');
  console.log('Backup role reads all 18 guest tables and object references; writes and role escalation denied.');
 }
} finally {await db.end();}
