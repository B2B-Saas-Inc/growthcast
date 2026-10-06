CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
\i /isolation.sql
CREATE SCHEMA storage;
CREATE TABLE storage.objects(id uuid,bucket_id text,name text,metadata jsonb);
INSERT INTO storage.objects VALUES('00000000-0000-0000-0000-000000000001','gc-atrium-private','private.txt','{}'),('00000000-0000-0000-0000-000000000002','other-bucket','hidden.txt','{}');
SET ROLE gc_migrate;
CREATE TABLE gc_atrium.backup_fixture(id serial PRIMARY KEY);
INSERT INTO gc_atrium.backup_fixture DEFAULT VALUES;
RESET ROLE;
\i /backup/provision.sql
SET ROLE gc_migrate;
CREATE TABLE gc_atrium.future_fixture(id integer);
INSERT INTO gc_atrium.future_fixture VALUES(42);
RESET ROLE;
SET SESSION AUTHORIZATION gc_backup;
DO $$ BEGIN
 IF (SELECT count(*) FROM gc_atrium.backup_fixture) <> 1 OR (SELECT id FROM gc_atrium.future_fixture) <> 42 THEN RAISE EXCEPTION 'Backup reads missing'; END IF;
 IF (SELECT count(*) FROM gc_backup_meta.storage_objects) <> 1 OR (SELECT name FROM gc_backup_meta.storage_objects) <> 'private.txt' THEN RAISE EXCEPTION 'Storage scope escaped'; END IF;
 BEGIN INSERT INTO gc_atrium.future_fixture VALUES(99); RAISE EXCEPTION 'Write allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM nextval('gc_atrium.backup_fixture_id_seq'); RAISE EXCEPTION 'Sequence mutation allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM storage.objects; RAISE EXCEPTION 'Platform storage read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN SET ROLE gc_migrate; RAISE EXCEPTION 'Owner escalation allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 IF has_schema_privilege('anon','gc_backup_meta','USAGE') OR has_schema_privilege('authenticated','gc_backup_meta','USAGE') OR has_schema_privilege('service_role','gc_backup_meta','USAGE') THEN RAISE EXCEPTION 'API role exposure'; END IF;
END $$;
