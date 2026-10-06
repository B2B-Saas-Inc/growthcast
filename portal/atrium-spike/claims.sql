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
