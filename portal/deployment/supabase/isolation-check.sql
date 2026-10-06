-- Transactional probes leave no fixture objects behind, including on live staging.
BEGIN;
SET LOCAL ROLE gc_migrate;
CREATE TABLE gc_atrium.isolation_probe(id integer);
CREATE FUNCTION gc_atrium.isolation_probe() RETURNS integer LANGUAGE sql AS 'SELECT 1';
CREATE TYPE gc_atrium.isolation_probe_type AS ENUM ('test');
RESET ROLE;
SET LOCAL ROLE gc_documenso_migrate;
CREATE TABLE gc_documenso.isolation_probe(id integer);
CREATE FUNCTION gc_documenso.isolation_probe() RETURNS integer LANGUAGE sql AS 'SELECT 1';
RESET ROLE;
DO $$
DECLARE who text; ns text;
BEGIN
  FOREACH who IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    FOREACH ns IN ARRAY ARRAY['gc_atrium','gc_documenso','portal_meta','portal_api'] LOOP
      IF has_schema_privilege(who,ns,'USAGE') OR has_schema_privilege(who,ns,'CREATE') THEN
        RAISE EXCEPTION 'API schema privilege leaked: % %',who,ns;
      END IF;
    END LOOP;
    FOREACH ns IN ARRAY ARRAY['gc_atrium','gc_documenso'] LOOP
      IF has_table_privilege(who,(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ns AND c.relname='isolation_probe'),'SELECT')
        OR has_function_privilege(who,(SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=ns AND p.proname='isolation_probe'),'EXECUTE') THEN
        RAISE EXCEPTION 'Default object privilege leaked: % %',who,ns;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH who IN ARRAY ARRAY['gc_app','gc_gateway','gc_lifecycle','gc_documenso'] LOOP
    FOREACH ns IN ARRAY ARRAY['gc_atrium','gc_documenso','portal_meta','portal_api','public'] LOOP
      IF has_schema_privilege(who,ns,'CREATE') THEN RAISE EXCEPTION 'Runtime DDL allowed'; END IF;
    END LOOP;
    IF pg_has_role(who,'gc_migrate','MEMBER') OR pg_has_role(who,'gc_documenso_migrate','MEMBER') THEN
      RAISE EXCEPTION 'Runtime owner membership';
    END IF;
  END LOOP;
  IF has_schema_privilege('gc_migrate','gc_documenso','USAGE')
    OR has_schema_privilege('gc_documenso_migrate','gc_atrium','USAGE')
    OR has_schema_privilege('gc_documenso','gc_atrium','USAGE')
    OR has_schema_privilege('gc_app','gc_documenso','USAGE') THEN RAISE EXCEPTION 'Cross-application access'; END IF;
END $$;
SET LOCAL ROLE gc_app;
DO $$ BEGIN
  BEGIN EXECUTE 'CREATE TABLE gc_atrium.forbidden(id int)'; RAISE EXCEPTION 'DDL unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM gc_atrium.isolation_probe(); RAISE EXCEPTION 'Function unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ BEGIN
  BEGIN PERFORM * FROM gc_atrium.isolation_probe; RAISE EXCEPTION 'API read unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'isolated schemas, default privileges, API denial, runtime DDL and cross-application denial verified' AS result;
ROLLBACK;
