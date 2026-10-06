GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA gc_documenso TO gc_documenso;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA gc_documenso TO gc_documenso;
REVOKE ALL ON gc_documenso._growthcast_migrations,gc_documenso._growthcast_schema_state FROM gc_documenso;
GRANT SELECT ON gc_documenso._growthcast_migrations,gc_documenso._growthcast_schema_state TO gc_documenso;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA gc_documenso TO gc_documenso;
DO $$ DECLARE item record; BEGIN
 FOR item IN SELECT typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='gc_documenso' AND t.typtype IN ('e','d') LOOP
  EXECUTE format('GRANT USAGE ON TYPE gc_documenso.%I TO gc_documenso',item.typname);
 END LOOP;
END $$;
ALTER FUNCTION gc_documenso.nanoid(integer,text,double precision) SET search_path=gc_documenso,pg_catalog;
ALTER FUNCTION gc_documenso.nanoid_optimized(integer,text,integer,integer) SET search_path=gc_documenso,pg_catalog;
ALTER FUNCTION gc_documenso.generate_prefix_id(text) SET search_path=gc_documenso,pg_catalog;
ALTER FUNCTION gc_documenso.generate_id() SET search_path=gc_documenso,pg_catalog;
