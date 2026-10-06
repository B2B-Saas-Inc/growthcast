import assert from 'node:assert/strict';
import pg from 'pg';
import {readFileSync} from 'node:fs';
import {supabaseConnection} from '../supabase-config.mjs';
import {guard as atrium} from '../supabase/managed-atrium/migrate.mjs';
import {guard as documenso} from '../supabase/managed-documenso/migrate.mjs';
let db;
try {
 const config=supabaseConnection({projectRef:'saedetvoolpdysiyjwvg',url:readFileSync('/source/backup-database-url','utf8').trim(),ca:readFileSync('/source/prod-ca-2021.crt','utf8')});
 db=new pg.Client(config);await db.connect();
 assert.equal((await db.query('SELECT current_user')).rows[0].current_user,'gc_backup');
 assert.equal((await db.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl,true);
 assert.equal((await db.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only,'on');
 const role=(await db.query("SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];
 assert.equal(role.rolcanlogin,true);assert.ok(Object.entries(role).every(([k,v])=>k==='rolcanlogin'||!v));
 assert.equal((await db.query('SELECT count(*)::int AS n FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)')).rows[0].n,0);
 await db.query('SET search_path=gc_atrium,pg_catalog');await atrium(db);
 await db.query('SET search_path=gc_documenso,pg_catalog');await documenso(db);
 await db.query('SELECT id,bucket_id,name,metadata FROM gc_backup_meta.storage_objects');
 // Prove privilege denials even after a caller disables its read-only session default.
 await db.query('SET default_transaction_read_only=off');
 for(const sql of ['CREATE TABLE gc_atrium.backup_escape(id int)','UPDATE gc_atrium."user" SET name=name WHERE false','DELETE FROM portal_meta.migrations WHERE false','UPDATE gc_documenso."User" SET name=name WHERE false','SELECT * FROM storage.objects','SELECT * FROM auth.users','SET ROLE gc_migrate','SET ROLE gc_documenso_migrate','SET ROLE gc_app','SET ROLE postgres']) {
  await assert.rejects(()=>db.query(sql),error=>error.code==='42501');
 }
 const functions=(await db.query("SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('gc_atrium','gc_documenso','portal_meta') AND has_function_privilege(current_user,p.oid,'EXECUTE')")).rows[0].n;
 assert.equal(functions,0);
 const appLogins=(await db.query("SELECT rolname,rolcanlogin FROM pg_roles WHERE rolname IN ('gc_migrate','gc_app','gc_gateway','gc_lifecycle','gc_documenso_migrate','gc_documenso') ORDER BY rolname")).rows;
 assert.equal(appLogins.length,6);assert.ok(appLogins.every(r=>!r.rolcanlogin));
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),role:'gc_backup',verifiedTLS:true,roleMemberships:0,privateExecutableFunctions:0,guards:['atrium','documenso'],writeAndEscalationDenials:10,appLogins}));
} catch {console.error('Backup identity verification failed; sensitive output withheld');process.exitCode=1;}
finally {if(db)await db.end();}
