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
