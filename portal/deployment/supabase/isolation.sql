-- Empty dedicated project only. Application migrations are intentionally separate.
-- Keep historical public-schema migrations unchanged; use a reviewed managed baseline.
BEGIN;
SELECT pg_advisory_xact_lock(7814202);
DO $$
DECLARE role_name text; schema_name text; owner_name text;
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Project administrator required'; END IF;
  IF EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')) THEN
    RAISE EXCEPTION 'Dedicated empty public schema required';
  END IF;
  FOREACH role_name IN ARRAY ARRAY['gc_migrate','gc_app','gc_gateway','gc_lifecycle','gc_documenso_migrate','gc_documenso'] LOOP
    IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',role_name);
    END IF;
    IF EXISTS(SELECT FROM pg_roles WHERE rolname=role_name AND
      (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls OR rolcanlogin)) THEN
      RAISE EXCEPTION 'Unexpected existing role privileges: %',role_name;
    END IF;
    IF EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=role_name) THEN
      RAISE EXCEPTION 'Portal role must not inherit or assume another role: %',role_name;
    END IF;
    -- Administrator alone can provision objects owned by these roles.
    EXECUTE format('GRANT %I TO postgres WITH INHERIT TRUE, SET TRUE',role_name);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON TABLES FROM PUBLIC,anon,authenticated,service_role',role_name);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON SEQUENCES FROM PUBLIC,anon,authenticated,service_role',role_name);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON FUNCTIONS FROM PUBLIC,anon,authenticated,service_role',role_name);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON TYPES FROM PUBLIC,anon,authenticated,service_role',role_name);
  END LOOP;
  FOR schema_name,owner_name IN SELECT * FROM (VALUES
    ('gc_atrium','gc_migrate'),('portal_meta','gc_migrate'),
    ('gc_documenso','gc_documenso_migrate'),('portal_api','postgres')) AS s(n,o)
  LOOP
    IF NOT EXISTS(SELECT FROM pg_namespace WHERE nspname=schema_name) THEN
      EXECUTE format('CREATE SCHEMA %I AUTHORIZATION %I',schema_name,owner_name);
    END IF;
    IF NOT EXISTS(SELECT FROM pg_namespace WHERE nspname=schema_name AND pg_get_userbyid(nspowner)=owner_name) THEN
      RAISE EXCEPTION 'Unexpected schema owner: %',schema_name;
    END IF;
    IF EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=schema_name)
       OR EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=schema_name)
       OR EXISTS(SELECT FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=schema_name) THEN
      RAISE EXCEPTION 'Isolation bootstrap requires empty schema: %',schema_name;
    END IF;
    EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC,anon,authenticated,service_role,gc_app,gc_gateway,gc_lifecycle,gc_documenso',schema_name);
  END LOOP;
END $$;
GRANT USAGE ON SCHEMA gc_atrium TO gc_app,gc_gateway,gc_lifecycle;
GRANT USAGE ON SCHEMA gc_documenso TO gc_documenso;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER ROLE gc_migrate SET search_path=gc_atrium,pg_catalog;
ALTER ROLE gc_app SET search_path=gc_atrium,pg_catalog;
ALTER ROLE gc_gateway SET search_path=gc_atrium,pg_catalog;
ALTER ROLE gc_lifecycle SET search_path=gc_atrium,pg_catalog;
ALTER ROLE gc_documenso_migrate SET search_path=gc_documenso,pg_catalog;
ALTER ROLE gc_documenso SET search_path=gc_documenso,pg_catalog;
-- Drop temporary inherited ownership after provisioning; retain explicit SET ROLE.
GRANT gc_migrate,gc_app,gc_gateway,gc_lifecycle,gc_documenso_migrate,gc_documenso TO postgres WITH INHERIT FALSE, SET TRUE;
COMMIT;
