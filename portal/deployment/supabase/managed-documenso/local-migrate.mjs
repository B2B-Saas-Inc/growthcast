import pg from 'pg';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {migrate,guard} from './migrate.mjs';
import {migrate as migrateLegacy,guard as legacyGuard} from './recovery/legacy-v1/migrate.mjs';
const admin=new pg.Client({host:'database',database:'documenso_test',user:'postgres'});await admin.connect();
try {
 await admin.query('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS');
 await admin.query(readFileSync('/app/deployment/supabase/isolation.sql','utf8'));
 await admin.query('CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; CREATE EXTENSION pg_trgm WITH SCHEMA extensions; GRANT USAGE ON SCHEMA extensions TO gc_documenso_migrate,gc_documenso; ALTER ROLE gc_documenso_migrate LOGIN; ALTER ROLE gc_documenso LOGIN');
} finally {await admin.end();}
const db=new pg.Client({host:'database',database:'documenso_test',user:'gc_documenso_migrate'});await db.connect();
try {await migrateLegacy(db);await legacyGuard(db);await assert.rejects(()=>guard(db),/history mismatch/);
 await migrate(db);await migrate(db);await guard(db);
 console.log('Original 165-step history upgraded to fingerprint v2 without rewriting checksums.');
 await db.query('ALTER TABLE "User" ADD COLUMN drift_probe text');await assert.rejects(()=>guard(db),/Schema drift/);await assert.rejects(()=>migrate(db),/Schema drift/);await db.query('ALTER TABLE "User" DROP COLUMN drift_probe');await guard(db);
 console.log('Managed Documenso migrations, idempotence and drift denials passed.');
} finally {await db.end();}
const runtime=new pg.Client({host:'database',database:'documenso_test',user:'gc_documenso'});await runtime.connect();
try {await guard(runtime);for(const sql of ['CREATE TABLE gc_documenso.escape(id int)','DELETE FROM _growthcast_migrations','SET ROLE gc_documenso_migrate'])await assert.rejects(()=>runtime.query(sql),e=>e.code==='42501');console.log('Restricted provider guard and DDL/ledger/role denials passed.');}
finally {await runtime.end();}
