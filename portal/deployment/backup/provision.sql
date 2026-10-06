-- Operational backup permissions, separate from immutable application migration histories.
-- Run once, as project administrator, inside the provisioner's transaction.
DO $$ BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Administrator required'; END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='gc_backup') OR EXISTS(SELECT FROM pg_namespace WHERE nspname='gc_backup_meta') THEN
  RAISE EXCEPTION 'Existing backup identity requires explicit review';
 END IF;
END $$;
CREATE ROLE gc_backup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE gc_backup SET default_transaction_read_only=on;
ALTER ROLE gc_backup SET statement_timeout='120s';
ALTER ROLE gc_backup SET search_path=pg_catalog;
GRANT CONNECT ON DATABASE postgres TO gc_backup;
-- Managed owners are non-inheriting: grant as each explicit owner, then reset.
SET ROLE gc_migrate;
GRANT USAGE ON SCHEMA gc_atrium,portal_meta TO gc_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA gc_atrium,portal_meta TO gc_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA gc_atrium,portal_meta TO gc_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA gc_atrium,portal_meta GRANT SELECT ON TABLES TO gc_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA gc_atrium,portal_meta GRANT SELECT ON SEQUENCES TO gc_backup;
RESET ROLE;
SET ROLE gc_documenso_migrate;
GRANT USAGE ON SCHEMA gc_documenso TO gc_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA gc_documenso TO gc_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA gc_documenso TO gc_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA gc_documenso GRANT SELECT ON TABLES TO gc_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA gc_documenso GRANT SELECT ON SEQUENCES TO gc_backup;
RESET ROLE;
CREATE SCHEMA gc_backup_meta AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA gc_backup_meta FROM PUBLIC,anon,authenticated,service_role;
CREATE VIEW gc_backup_meta.storage_objects WITH (security_barrier=true) AS
 SELECT id,bucket_id,name,metadata FROM storage.objects WHERE bucket_id='gc-atrium-private';
REVOKE ALL ON gc_backup_meta.storage_objects FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA gc_backup_meta TO gc_backup;
GRANT SELECT ON gc_backup_meta.storage_objects TO gc_backup;
