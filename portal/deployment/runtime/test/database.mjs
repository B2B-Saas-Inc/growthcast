import pg from 'pg';
import {readFileSync} from 'node:fs';
import {migrate,guard} from '../../supabase/managed-documenso/migrate.mjs';
import {migrate as migrateAtrium,guard as guardAtrium} from '../../supabase/managed-atrium/migrate.mjs';
const atrium = process.env.FIXTURE_SERVICE === 'atrium';
const db = new pg.Client({host:'db.abcdefghijklmnopqrst.supabase.co',database:'postgres',user:'postgres',
  password:readFileSync('/admin/password','utf8'),ssl:{rejectUnauthorized:true,ca:readFileSync('/runtime/database-ca.crt','utf8')}});
await db.connect();
try {
  if (atrium && process.argv[2] === 'enroll') {
    await db.query(`INSERT INTO gc_atrium.project(id,name,"organizationId","updatedAt") VALUES
      ('runtime-project','Assigned project','runtime-org',now()),
      ('runtime-unassigned','Unassigned project','runtime-org',now()),
      ('runtime-other-project','Other organization project','runtime-other-org',now());
      INSERT INTO gc_atrium.project_client(id,"projectId","userId") SELECT 'runtime-assignment','runtime-project',id FROM gc_atrium."user" WHERE email='invited@growthcast.invalid';
      INSERT INTO gc_atrium.file(id,filename,"storageKey","projectId","organizationId","uploadedById","updatedAt") VALUES
      ('runtime-unassigned-file','private.txt','unassigned.txt','runtime-unassigned','runtime-org','synthetic-operator',now()),
      ('runtime-other-file','private.txt','other.txt','runtime-other-project','runtime-other-org','synthetic-operator',now())`);
  } else if (atrium && process.argv[2] === 'unenroll') {
    await db.query("DELETE FROM gc_atrium.project_client WHERE id='runtime-assignment'");
  } else if (process.argv[2] === 'drift') {
    await db.query(atrium ? 'ALTER TABLE gc_atrium."user" ADD COLUMN runtime_drift text' : 'ALTER TABLE gc_documenso."User" ADD COLUMN runtime_drift text');
  } else if (process.argv[2] === 'repair') {
    await db.query(atrium ? 'ALTER TABLE gc_atrium."user" DROP COLUMN runtime_drift' : 'ALTER TABLE gc_documenso."User" DROP COLUMN runtime_drift');
  } else {
    await db.query('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS');
    await db.query(readFileSync(new URL('../../supabase/isolation.sql',import.meta.url),'utf8'));
    await db.query('CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; CREATE EXTENSION pg_trgm WITH SCHEMA extensions; GRANT USAGE ON SCHEMA extensions TO gc_documenso_migrate,gc_documenso');
    await db.query(atrium ? 'SET ROLE gc_migrate; SET search_path=gc_atrium,pg_catalog' : 'SET ROLE gc_documenso_migrate; SET search_path=gc_documenso,pg_catalog');
    if (atrium) { await migrateAtrium(db); await guardAtrium(db); }
    else { await migrate(db); await guard(db); }
    await db.query('RESET ROLE');
    const password = new URL(readFileSync('/runtime/database-url','utf8')).password;
    if (!/^[a-f0-9]{64}$/.test(password)) throw Error('Synthetic credential required');
    await db.query(`ALTER ROLE ${atrium ? 'gc_app' : 'gc_documenso'} LOGIN PASSWORD '${password}'`);
    if (atrium) {
      await db.query(`INSERT INTO gc_atrium.organization(id,name,"updatedAt") VALUES('runtime-org','Synthetic agency',now()),('runtime-other-org','Other synthetic agency',now());
        INSERT INTO gc_atrium.invitation(id,"organizationId",email,role,status,"expiresAt","inviterId")
        VALUES('runtime-invite','runtime-org','invited@growthcast.invalid','member','pending',now()+interval '1 hour','synthetic-inviter'),
        ('runtime-expired','runtime-org','expired@growthcast.invalid','member','pending',now()-interval '1 hour','synthetic-inviter')`);
    }
  }
} finally { await db.end(); }
console.log('Disposable database operation complete.');
