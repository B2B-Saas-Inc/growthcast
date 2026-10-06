// Disposable migration acceptance only; not a runtime migration command.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {migrate,guard} from '../../deployment/supabase/managed-atrium/migrate.mjs';
import {verifyRuntime} from '../../deployment/runtime/config.mjs';
const mode=process.argv[2],role=mode==='guard'?(process.env.GC_VERIFY_ROLE??'gc_app'):'gc_migrate';
assert(['gc_app','gc_gateway','gc_lifecycle','gc_migrate'].includes(role));
const connection={host:'database',database:'foundation_test',user:role,password:readFileSync('/credential/password','utf8').trim(),ssl:{ca:readFileSync('/ca/server.crt','utf8'),rejectUnauthorized:true},options:'-c search_path=gc_atrium,pg_catalog'};
const db=new pg.Client(connection);
if(mode==='guard'){await verifyRuntime(db,{role,schema:'gc_atrium'},guard);console.log(role+' restricted role, TLS and thirteen-migration schema guard passed.');}
else {
 await db.connect();try {
  await migrate(db);await migrate(db);await guard(db);
  assert.equal((await db.query('SELECT count(*)::int n FROM portal_meta.migrations')).rows[0].n,13);
  // PostgreSQL reparses deparsed CHECK expressions during pg_restore.
  await db.query('BEGIN');
  const constraint=(await db.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='gc_atrium.guest_catalog_state'::regclass AND conname='guest_catalog_state_label_check'")).rows[0].definition;
  await db.query('ALTER TABLE gc_atrium.guest_catalog_state DROP CONSTRAINT guest_catalog_state_label_check');
  await db.query('ALTER TABLE gc_atrium.guest_catalog_state ADD CONSTRAINT guest_catalog_state_label_check '+constraint);
  await guard(db);await db.query('ROLLBACK');
  await db.query('BEGIN; CREATE TABLE gc_atrium.guest_drift_fixture(id integer)');
  await assert.rejects(()=>guard(db));await db.query('ROLLBACK');await guard(db);
  console.log('Candidate migration, idempotent retry and schema-drift refusal passed.');
 }finally{await db.end();}
}
