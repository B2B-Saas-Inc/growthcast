-- Reviewed dedicated-bucket policy. Administrator sets growthcast.storage_subject
-- to the provisioned service user's UUID inside the same transaction.
DO $$
DECLARE actor uuid := current_setting('growthcast.storage_subject')::uuid;
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Storage policy administrator required'; END IF;
  IF NOT EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='storage' AND c.relname='objects' AND c.relrowsecurity) THEN
    RAISE EXCEPTION 'Storage RLS required';
  END IF;
  IF NOT EXISTS(SELECT FROM storage.buckets WHERE id='gc-atrium-private' AND public=false) THEN
    RAISE EXCEPTION 'Private dedicated bucket required';
  END IF;
  IF EXISTS(SELECT FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'gc_atrium_%') THEN
    RAISE EXCEPTION 'Existing policy requires explicit review; refusing overwrite';
  END IF;
  EXECUTE format('CREATE POLICY gc_atrium_isolation ON storage.objects AS RESTRICTIVE FOR ALL TO PUBLIC USING ((bucket_id <> %L OR auth.uid() = %L::uuid) AND (auth.uid() IS DISTINCT FROM %L::uuid OR bucket_id = %L)) WITH CHECK ((bucket_id <> %L OR auth.uid() = %L::uuid) AND (auth.uid() IS DISTINCT FROM %L::uuid OR bucket_id = %L))',
    'gc-atrium-private',actor,actor,'gc-atrium-private','gc-atrium-private',actor,actor,'gc-atrium-private');
  EXECUTE format('CREATE POLICY gc_atrium_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id=%L AND auth.uid()=%L::uuid)','gc-atrium-private',actor);
  EXECUTE format('CREATE POLICY gc_atrium_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id=%L AND auth.uid()=%L::uuid)','gc-atrium-private',actor);
  EXECUTE format('CREATE POLICY gc_atrium_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id=%L AND auth.uid()=%L::uuid)','gc-atrium-private',actor);
  CREATE POLICY gc_atrium_no_overwrite ON storage.objects AS RESTRICTIVE FOR UPDATE TO PUBLIC
    USING (bucket_id <> 'gc-atrium-private') WITH CHECK (bucket_id <> 'gc-atrium-private');
END $$;
