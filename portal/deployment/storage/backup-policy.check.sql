\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('growthcast.backup_storage_subject','33333333-3333-4333-8333-333333333333',true);
\i /checks/backup-policy.sql
COMMIT;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
DO $$ DECLARE affected int; BEGIN
  IF (SELECT count(*) FROM storage.objects)<>1 OR NOT EXISTS(SELECT FROM storage.objects WHERE name='fixture') THEN RAISE EXCEPTION 'Reader scope incorrect'; END IF;
  BEGIN INSERT INTO storage.objects VALUES('gc-atrium-private','reader-write'); RAISE EXCEPTION 'Reader insert allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO storage.objects VALUES('other-bucket','reader-escape'); RAISE EXCEPTION 'Reader escaped'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE storage.objects SET name='reader-update'; GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'Reader updated'; END IF;
  DELETE FROM storage.objects; GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'Reader deleted'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $$ DECLARE affected int; BEGIN
  IF (SELECT count(*) FROM storage.objects)<>1 THEN RAISE EXCEPTION 'Writer scope changed'; END IF;
  INSERT INTO storage.objects VALUES('gc-atrium-private','writer-regression');
  UPDATE storage.objects SET name='overwrite'; GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'Writer overwrite allowed'; END IF;
  DELETE FROM storage.objects WHERE name='writer-regression'; GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'Writer delete failed'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
DO $$ BEGIN IF EXISTS(SELECT FROM storage.objects WHERE bucket_id='gc-atrium-private') THEN RAISE EXCEPTION 'Peer access'; END IF; END $$;
RESET ROLE; SET ROLE anon;
SELECT set_config('request.jwt.claim.sub','',false);
DO $$ BEGIN IF EXISTS(SELECT FROM storage.objects WHERE bucket_id='gc-atrium-private') THEN RAISE EXCEPTION 'Anonymous access'; END IF; END $$;
RESET ROLE;
