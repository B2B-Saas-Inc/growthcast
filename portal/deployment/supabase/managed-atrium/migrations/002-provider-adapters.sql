-- Frozen Phase 1 adapter schema. Roles are provisioned separately.

-- Source: portal/gateway/schema.sql
-- Disposable gateway spike only. Final entities belong in the Atrium database.
CREATE TABLE IF NOT EXISTS grants (
  id uuid PRIMARY KEY,
  binding jsonb NOT NULL,
  generation integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS handoffs (
  token_hash text PRIMARY KEY,
  grant_id uuid NOT NULL REFERENCES grants(id),
  generation integer NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  grant_id uuid NOT NULL REFERENCES grants(id),
  generation integer NOT NULL,
  csrf_hash text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS handoffs_expiry ON handoffs(expires_at);
-- Trusted lifecycle reconciliation records a final artifact without rewriting
-- the approved source/version binding. No browser route can write this table.
CREATE TABLE IF NOT EXISTS sealed_artifacts (
  grant_id uuid NOT NULL REFERENCES grants(id),
  item_id text NOT NULL,
  data_id text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (grant_id, item_id)
);
CREATE TABLE IF NOT EXISTS pin_shares (
  share_hash text PRIMARY KEY,
  grant_id uuid NOT NULL UNIQUE REFERENCES grants(id),
  generation integer NOT NULL,
  salt bytea NOT NULL,
  pin_hash bytea NOT NULL
);
CREATE TABLE IF NOT EXISTS pin_attempts (
  bucket text PRIMARY KEY,
  attempts integer NOT NULL,
  resets_at timestamptz NOT NULL
);
CREATE OR REPLACE FUNCTION preserve_grant_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.binding IS DISTINCT FROM OLD.binding THEN
    RAISE EXCEPTION 'Grant bindings are immutable; revoke and create a new grant';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS grant_binding_immutable ON grants;
CREATE TRIGGER grant_binding_immutable BEFORE UPDATE ON grants
FOR EACH ROW EXECUTE FUNCTION preserve_grant_binding();

-- Account-derived grants fail closed unless a durable account validator is supplied.
-- Guest PIN grants have no row here and retain their existing authorization flow.
CREATE TABLE IF NOT EXISTS account_grants (
  grant_id uuid PRIMARY KEY REFERENCES grants(id),
  context jsonb NOT NULL CHECK (jsonb_typeof(context)='object')
);

-- Source: portal/atrium-spike/claims.sql
CREATE TABLE portal_claims (
  token_hash text PRIMARY KEY,
  grant_id uuid NOT NULL REFERENCES grants(id),
  generation integer NOT NULL,
  document_id text NOT NULL REFERENCES document(id),
  document_version integer NOT NULL,
  file_id text NOT NULL,
  project_id text NOT NULL REFERENCES project(id),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  user_id text REFERENCES "user"(id)
);
CREATE TABLE portal_claim_audit (
  claim_hash text PRIMARY KEY REFERENCES portal_claims(token_hash),
  user_id text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Source: portal/atrium-spike/ownership.sql
-- Local integration fixture. No canonical writer/bypass role is installed.
CREATE TABLE provider_documents (
  document_id text PRIMARY KEY REFERENCES document(id),
  provider text NOT NULL CHECK (provider='documenso'),
  external_id text NOT NULL UNIQUE
);
CREATE TABLE provider_invoices (
  invoice_id text PRIMARY KEY REFERENCES invoice(id),
  provider text NOT NULL CHECK (provider='stripe-invoicing'),
  external_id text NOT NULL UNIQUE
);
CREATE FUNCTION deny_provider_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous jsonb; following jsonb; target text;
BEGIN
  previous := CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  following := CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
  IF TG_TABLE_NAME IN ('provider_documents','provider_invoices') THEN
    RAISE EXCEPTION 'Provider ownership is immutable' USING ERRCODE='42501';
  ELSIF TG_TABLE_NAME='document' THEN
    IF EXISTS(SELECT 1 FROM provider_documents WHERE document_id IN (previous->>'id',following->>'id')) THEN
      RAISE EXCEPTION 'Provider document is read only' USING ERRCODE='42501';
    END IF;
  ELSIF TG_TABLE_NAME='invoice' THEN
    IF EXISTS(SELECT 1 FROM provider_invoices WHERE invoice_id IN (previous->>'id',following->>'id')) THEN
      RAISE EXCEPTION 'Provider invoice is read only' USING ERRCODE='42501';
    END IF;
  ELSIF TG_TABLE_NAME='invoice_line_item' THEN
    IF EXISTS(SELECT 1 FROM provider_invoices WHERE invoice_id IN (previous->>'invoiceId',following->>'invoiceId')) THEN
      RAISE EXCEPTION 'Provider invoice is read only' USING ERRCODE='42501';
    END IF;
  ELSIF TG_TABLE_NAME='file' THEN
    target := previous->>'id';
    IF EXISTS(SELECT 1 FROM provider_documents p JOIN document d ON d.id=p.document_id
        WHERE d."fileId"=target OR d."signedFileId"=target)
      OR EXISTS(SELECT 1 FROM provider_documents p JOIN document_version v ON v."documentId"=p.document_id WHERE v."fileId"=target)
      OR EXISTS(SELECT 1 FROM provider_invoices p JOIN invoice i ON i.id=p.invoice_id WHERE i."uploadedFileId"=target) THEN
      RAISE EXCEPTION 'Provider artifact is read only' USING ERRCODE='42501';
    END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM provider_documents WHERE document_id IN (previous->>'documentId',following->>'documentId')) THEN
      RAISE EXCEPTION 'Provider document is read only' USING ERRCODE='42501';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
DO $$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['document','invoice','file','provider_documents','provider_invoices'] LOOP
    EXECUTE format('CREATE TRIGGER provider_read_only BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION deny_provider_mutation()',target);
  END LOOP;
  FOREACH target IN ARRAY ARRAY['document_response','signature_field','document_version','document_access_token','invoice_line_item'] LOOP
    EXECUTE format('CREATE TRIGGER provider_read_only BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION deny_provider_mutation()',target);
  END LOOP;
END;
$$;

-- Source: portal/atrium-spike/completion.sql
-- Append-only canonical evidence; native Atrium rows stay read-only.
-- A restricted lifecycle role writes through the leased completion function.
-- No web controller exposes this writer. Schema setup still uses the test owner.
CREATE TABLE provider_completions (
  document_id text NOT NULL REFERENCES provider_documents(document_id),
  grant_id uuid PRIMARY KEY REFERENCES grants(id),
  item_id text NOT NULL,
  data_id text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  verified_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (grant_id,item_id) REFERENCES sealed_artifacts(grant_id,item_id)
);
CREATE FUNCTION deny_completion_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Canonical completion is immutable' USING ERRCODE='42501'; END;
$$;
CREATE TRIGGER completion_read_only BEFORE UPDATE OR DELETE ON provider_completions
FOR EACH ROW EXECUTE FUNCTION deny_completion_mutation();

-- Source: portal/atrium-spike/lifecycle.sql
-- Disposable local role setup, not a production migration/password policy.
-- Role provisioned by explicit bootstrap job.
REVOKE CREATE ON SCHEMA gc_atrium FROM PUBLIC;
GRANT USAGE ON SCHEMA gc_atrium TO gc_lifecycle;
CREATE TABLE gc_atrium.lifecycle_jobs (
  grant_id uuid PRIMARY KEY REFERENCES gc_atrium.grants(id),
  document_id text NOT NULL REFERENCES gc_atrium.provider_documents(document_id),
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
CREATE FUNCTION gc_atrium.lifecycle_claim() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,gc_atrium AS $$
DECLARE job gc_atrium.lifecycle_jobs; binding jsonb;
BEGIN
  UPDATE gc_atrium.lifecycle_jobs SET state='dead',lease_token=NULL,lease_until=NULL
    WHERE state='processing' AND lease_until<=clock_timestamp() AND attempts>=5;
  SELECT * INTO job FROM gc_atrium.lifecycle_jobs
    WHERE attempts<5 AND ((state='pending' AND available_at<=clock_timestamp()) OR (state='processing' AND lease_until<=clock_timestamp()))
    ORDER BY available_at,grant_id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE gc_atrium.lifecycle_jobs SET state='processing',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds'
    WHERE grant_id=job.grant_id RETURNING * INTO job;
  SELECT g.binding INTO binding FROM gc_atrium.grants g WHERE g.id=job.grant_id;
  RETURN to_jsonb(job)||jsonb_build_object('binding',binding);
END;
$$;
CREATE FUNCTION gc_atrium.lifecycle_retry(target uuid, lease uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,gc_atrium AS $$
BEGIN
  UPDATE gc_atrium.lifecycle_jobs SET state=CASE WHEN attempts>=5 THEN 'dead' ELSE 'pending' END,
    available_at=clock_timestamp()+make_interval(secs=>LEAST(300,power(2,attempts)::integer)),
    lease_token=NULL,lease_until=NULL,last_error='readback-failed'
    WHERE grant_id=target AND state='processing' AND lease_token=lease AND lease_until>clock_timestamp();
  RETURN FOUND;
END;
$$;
CREATE FUNCTION gc_atrium.lifecycle_complete(target uuid, lease uuid, approved jsonb, item text, data text, hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,gc_atrium AS $$
DECLARE job gc_atrium.lifecycle_jobs; scope jsonb;
BEGIN
  SELECT * INTO job FROM gc_atrium.lifecycle_jobs WHERE grant_id=target AND state='processing'
    AND lease_token=lease AND lease_until>clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Current lifecycle lease required'; END IF;
  SELECT g.binding INTO scope FROM gc_atrium.grants g
    JOIN gc_atrium.document d ON d.id=job.document_id
    JOIN gc_atrium.provider_documents p ON p.document_id=d.id
    WHERE g.id=target AND g.revoked_at IS NULL AND g.expires_at>clock_timestamp()
      AND p.external_id=g.binding->>'envelopeId'
      AND d."organizationId"=g.binding->>'organizationId' AND d."projectId"=g.binding->>'clientId'
      AND d.id||'-v'||d."currentVersion"::text=g.binding->>'documentVersion'
    FOR UPDATE OF g,d,p;
  IF NOT FOUND OR scope IS DISTINCT FROM approved THEN RAISE EXCEPTION 'Current approved portal binding required'; END IF;
  IF hash IS DISTINCT FROM job.verified_sha256 OR data IS NULL OR data !~ '^[A-Za-z0-9_-]{1,160}$'
    OR jsonb_array_length(scope->'items')<>1 OR item IS DISTINCT FROM scope->'items'->0->>'id'
    THEN RAISE EXCEPTION 'Approved sealed artifact required'; END IF;
  INSERT INTO gc_atrium.sealed_artifacts(grant_id,item_id,data_id,sha256) VALUES(target,item,data,hash) ON CONFLICT DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM gc_atrium.sealed_artifacts WHERE grant_id=target AND item_id=item AND data_id=data AND sha256=hash)
    THEN RAISE EXCEPTION 'Sealed artifact is immutable'; END IF;
  INSERT INTO gc_atrium.provider_completions(document_id,grant_id,item_id,data_id,sha256) VALUES(job.document_id,target,item,data,hash) ON CONFLICT DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM gc_atrium.provider_completions WHERE grant_id=target AND document_id=job.document_id AND item_id=item AND data_id=data AND sha256=hash)
    THEN RAISE EXCEPTION 'Canonical completion is immutable'; END IF;
  UPDATE gc_atrium.lifecycle_jobs SET state='done',completed_at=clock_timestamp(),lease_token=NULL,lease_until=NULL,last_error=NULL WHERE grant_id=target;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION gc_atrium.lifecycle_claim(), gc_atrium.lifecycle_retry(uuid,uuid), gc_atrium.lifecycle_complete(uuid,uuid,jsonb,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gc_atrium.lifecycle_claim(), gc_atrium.lifecycle_retry(uuid,uuid), gc_atrium.lifecycle_complete(uuid,uuid,jsonb,text,text,text) TO gc_lifecycle;
