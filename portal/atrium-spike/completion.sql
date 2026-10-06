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
