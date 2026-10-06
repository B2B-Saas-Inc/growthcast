-- Explicit one-time upgrade of the original five-policy storage boundary.
DO $$
DECLARE
  writer uuid := current_setting('growthcast.storage_subject')::uuid;
  reader uuid := current_setting('growthcast.backup_storage_subject')::uuid;
  original text;
  actual record;
BEGIN
  IF current_user <> 'postgres' OR writer=reader THEN RAISE EXCEPTION 'Distinct actors and administrator required'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'gc_atrium_%') <> 5
    OR EXISTS(SELECT FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'gc_backup_%') THEN
    RAISE EXCEPTION 'Unexpected policy inventory; refusing upgrade';
  END IF;
  -- Compare PostgreSQL-normalized expressions, not hand-formatted SQL strings.
  CREATE TEMP TABLE gc_expected_storage_policy(bucket_id text) ON COMMIT DROP;
  EXECUTE format('CREATE POLICY expected ON gc_expected_storage_policy AS RESTRICTIVE FOR ALL TO PUBLIC USING ((bucket_id <> %L OR auth.uid() = %L::uuid) AND (auth.uid() IS DISTINCT FROM %L::uuid OR bucket_id = %L)) WITH CHECK ((bucket_id <> %L OR auth.uid() = %L::uuid) AND (auth.uid() IS DISTINCT FROM %L::uuid OR bucket_id = %L))',
    'gc-atrium-private',writer,writer,'gc-atrium-private','gc-atrium-private',writer,writer,'gc-atrium-private');
  SELECT qual INTO original FROM pg_policies WHERE tablename='gc_expected_storage_policy' AND policyname='expected';
  SELECT * INTO actual FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='gc_atrium_isolation';
  IF actual.qual IS DISTINCT FROM original OR actual.with_check IS DISTINCT FROM original
    OR actual.permissive IS DISTINCT FROM 'RESTRICTIVE' OR actual.cmd IS DISTINCT FROM 'ALL'
    OR actual.roles IS DISTINCT FROM ARRAY['public']::name[] THEN
    RAISE EXCEPTION 'Original isolation policy differs from reviewed boundary';
  END IF;
  EXECUTE format('ALTER POLICY gc_atrium_isolation ON storage.objects USING ((bucket_id <> %L OR auth.uid() IN (%L::uuid,%L::uuid)) AND ((auth.uid() IS DISTINCT FROM %L::uuid AND auth.uid() IS DISTINCT FROM %L::uuid) OR bucket_id=%L)) WITH CHECK ((bucket_id <> %L OR auth.uid() IN (%L::uuid,%L::uuid)) AND ((auth.uid() IS DISTINCT FROM %L::uuid AND auth.uid() IS DISTINCT FROM %L::uuid) OR bucket_id=%L))',
    'gc-atrium-private',writer,reader,writer,reader,'gc-atrium-private','gc-atrium-private',writer,reader,writer,reader,'gc-atrium-private');
  EXECUTE format('CREATE POLICY gc_backup_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id=%L AND auth.uid()=%L::uuid)','gc-atrium-private',reader);
  EXECUTE format('CREATE POLICY gc_backup_no_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO PUBLIC WITH CHECK (auth.uid() IS DISTINCT FROM %L::uuid)',reader);
  EXECUTE format('CREATE POLICY gc_backup_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO PUBLIC USING (auth.uid() IS DISTINCT FROM %L::uuid) WITH CHECK (auth.uid() IS DISTINCT FROM %L::uuid)',reader,reader);
  EXECUTE format('CREATE POLICY gc_backup_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO PUBLIC USING (auth.uid() IS DISTINCT FROM %L::uuid)',reader);
END $$;
