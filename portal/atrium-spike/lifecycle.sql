-- Disposable local role setup, not a production migration/password policy.
CREATE ROLE gc_lifecycle LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO gc_lifecycle;
CREATE TABLE public.lifecycle_jobs (
  grant_id uuid PRIMARY KEY REFERENCES public.grants(id),
  document_id text NOT NULL REFERENCES public.provider_documents(document_id),
  team_id integer NOT NULL CHECK(team_id>0),
  verified_sha256 text NOT NULL CHECK(verified_sha256 ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','done','dead')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  last_error text CHECK(last_error IN ('readback-failed')),
  completed_at timestamptz
);
-- Only the trusted provisioning fixture may enqueue. No browser/webhook payload
-- can supply approved scope, provider team or independently verified PDF proof.
CREATE FUNCTION public.lifecycle_claim() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE job public.lifecycle_jobs; binding jsonb;
BEGIN
  UPDATE public.lifecycle_jobs SET state='dead',lease_token=NULL,lease_until=NULL
    WHERE state='processing' AND lease_until<=clock_timestamp() AND attempts>=5;
  SELECT * INTO job FROM public.lifecycle_jobs
    WHERE attempts<5 AND ((state='pending' AND available_at<=clock_timestamp()) OR (state='processing' AND lease_until<=clock_timestamp()))
    ORDER BY available_at,grant_id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.lifecycle_jobs SET state='processing',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds'
    WHERE grant_id=job.grant_id RETURNING * INTO job;
  SELECT g.binding INTO binding FROM public.grants g WHERE g.id=job.grant_id;
  RETURN to_jsonb(job)||jsonb_build_object('binding',binding);
END;
$$;
CREATE FUNCTION public.lifecycle_retry(target uuid, lease uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  UPDATE public.lifecycle_jobs SET state=CASE WHEN attempts>=5 THEN 'dead' ELSE 'pending' END,
    available_at=clock_timestamp()+make_interval(secs=>LEAST(300,power(2,attempts)::integer)),
    lease_token=NULL,lease_until=NULL,last_error='readback-failed'
    WHERE grant_id=target AND state='processing' AND lease_token=lease AND lease_until>clock_timestamp();
  RETURN FOUND;
END;
$$;
CREATE FUNCTION public.lifecycle_complete(target uuid, lease uuid, approved jsonb, item text, data text, hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE job public.lifecycle_jobs; scope jsonb;
BEGIN
  SELECT * INTO job FROM public.lifecycle_jobs WHERE grant_id=target AND state='processing'
    AND lease_token=lease AND lease_until>clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Current lifecycle lease required'; END IF;
  SELECT g.binding INTO scope FROM public.grants g
    JOIN public.document d ON d.id=job.document_id
    JOIN public.provider_documents p ON p.document_id=d.id
    WHERE g.id=target AND g.revoked_at IS NULL AND g.expires_at>clock_timestamp()
      AND p.external_id=g.binding->>'envelopeId'
      AND d."organizationId"=g.binding->>'organizationId' AND d."projectId"=g.binding->>'clientId'
      AND d.id||'-v'||d."currentVersion"::text=g.binding->>'documentVersion'
    FOR UPDATE OF g,d,p;
  IF NOT FOUND OR scope IS DISTINCT FROM approved THEN RAISE EXCEPTION 'Current approved portal binding required'; END IF;
  IF hash IS DISTINCT FROM job.verified_sha256 OR data IS NULL OR data !~ '^[A-Za-z0-9_-]{1,160}$'
    OR jsonb_array_length(scope->'items')<>1 OR item IS DISTINCT FROM scope->'items'->0->>'id'
    THEN RAISE EXCEPTION 'Approved sealed artifact required'; END IF;
  INSERT INTO public.sealed_artifacts(grant_id,item_id,data_id,sha256) VALUES(target,item,data,hash) ON CONFLICT DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM public.sealed_artifacts WHERE grant_id=target AND item_id=item AND data_id=data AND sha256=hash)
    THEN RAISE EXCEPTION 'Sealed artifact is immutable'; END IF;
  INSERT INTO public.provider_completions(document_id,grant_id,item_id,data_id,sha256) VALUES(job.document_id,target,item,data,hash) ON CONFLICT DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM public.provider_completions WHERE grant_id=target AND document_id=job.document_id AND item_id=item AND data_id=data AND sha256=hash)
    THEN RAISE EXCEPTION 'Canonical completion is immutable'; END IF;
  UPDATE public.lifecycle_jobs SET state='done',completed_at=clock_timestamp(),lease_token=NULL,lease_until=NULL,last_error=NULL WHERE grant_id=target;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.lifecycle_claim(), public.lifecycle_retry(uuid,uuid), public.lifecycle_complete(uuid,uuid,jsonb,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lifecycle_claim(), public.lifecycle_retry(uuid,uuid), public.lifecycle_complete(uuid,uuid,jsonb,text,text,text) TO gc_lifecycle;
