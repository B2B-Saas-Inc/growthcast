-- Private owners do not grant PUBLIC type usage. Grant only Atrium runtime roles.
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='gc_atrium' AND t.typtype IN ('e','d') LOOP
    EXECUTE format('GRANT USAGE ON TYPE gc_atrium.%I TO gc_app,gc_gateway,gc_lifecycle',item.typname);
  END LOOP;
END $$;
