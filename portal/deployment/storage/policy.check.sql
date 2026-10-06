\set ON_ERROR_STOP on
CREATE ROLE authenticated; CREATE ROLE anon;
CREATE SCHEMA storage; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE storage.buckets(id text PRIMARY KEY,public boolean);
CREATE TABLE storage.objects(bucket_id text,name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage,auth TO authenticated,anon;
GRANT ALL ON storage.objects TO authenticated;
GRANT SELECT ON storage.objects TO anon;
-- Deliberately broad preexisting policies test the restrictive isolation layer.
CREATE POLICY unrelated_allow ON storage.objects FOR ALL TO authenticated USING(true) WITH CHECK(true);
CREATE POLICY unrelated_read ON storage.objects FOR SELECT TO PUBLIC USING(true);
INSERT INTO storage.buckets VALUES('gc-atrium-private',false),('other-bucket',false);
SELECT set_config('growthcast.storage_subject','11111111-1111-4111-8111-111111111111',false);
\i /checks/policy.sql
INSERT INTO storage.objects VALUES('gc-atrium-private','fixture'),('other-bucket','other');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $$
DECLARE affected int;
BEGIN
  IF (SELECT count(*) FROM storage.objects) <> 1 THEN RAISE EXCEPTION 'Service escaped bucket'; END IF;
  INSERT INTO storage.objects VALUES('gc-atrium-private','new');
  BEGIN INSERT INTO storage.objects VALUES('other-bucket','escape'); RAISE EXCEPTION 'Cross-bucket write allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE storage.objects SET name='overwritten' WHERE name='fixture'; GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'Overwrite allowed'; END IF;
  DELETE FROM storage.objects WHERE name='new'; GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'Scoped deletion failed'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
DO $$ BEGIN
  IF EXISTS(SELECT FROM storage.objects WHERE bucket_id='gc-atrium-private') THEN RAISE EXCEPTION 'Other identity read private bucket'; END IF;
  BEGIN INSERT INTO storage.objects VALUES('gc-atrium-private','escape'); RAISE EXCEPTION 'Other identity wrote private bucket'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE; SET ROLE anon;
SELECT set_config('request.jwt.claim.sub','',false);
DO $$ BEGIN IF EXISTS(SELECT FROM storage.objects WHERE bucket_id='gc-atrium-private') THEN RAISE EXCEPTION 'Anonymous access'; END IF; END $$;
RESET ROLE;
