-- Phase 3 candidate: apply only in the disposable managed-schema harness.
-- Not in the deployed migration manifest until HTTP, artifact and recovery gates pass.
SET search_path=gc_atrium,pg_catalog;
CREATE TABLE guest_client (
 id uuid PRIMARY KEY, organization_id text NOT NULL REFERENCES organization(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
 UNIQUE(id,organization_id)
);
CREATE TABLE guest_recipient (
 id uuid PRIMARY KEY, client_id uuid NOT NULL, organization_id text NOT NULL,
 email text NOT NULL CHECK(email=lower(email) AND length(email) BETWEEN 3 AND 254),
 FOREIGN KEY(client_id,organization_id) REFERENCES guest_client(id,organization_id),
 UNIQUE(id,client_id,organization_id), UNIQUE(client_id,email)
);
CREATE TABLE guest_document (
 id uuid PRIMARY KEY, client_id uuid NOT NULL, organization_id text NOT NULL,
 project_id text NOT NULL REFERENCES project(id), kind text NOT NULL CHECK(kind IN ('proposal','contract','nda','supporting')),
 FOREIGN KEY(client_id,organization_id) REFERENCES guest_client(id,organization_id),
 UNIQUE(id,client_id,organization_id), UNIQUE(id,organization_id,project_id)
);
CREATE FUNCTION guest_project_scope() RETURNS trigger LANGUAGE plpgsql SET search_path=gc_atrium,pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM project WHERE id=NEW.project_id AND "organizationId"=NEW.organization_id) THEN
  RAISE EXCEPTION 'Project scope mismatch' USING ERRCODE='42501';
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER guest_project_scope BEFORE INSERT OR UPDATE ON guest_document FOR EACH ROW EXECUTE FUNCTION guest_project_scope();
CREATE TABLE guest_version (
 id uuid PRIMARY KEY, document_id uuid NOT NULL, client_id uuid NOT NULL, organization_id text NOT NULL,
 version integer NOT NULL CHECK(version>0), title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
 artifact_key text NOT NULL CHECK(length(artifact_key) BETWEEN 1 AND 512),
 artifact_sha256 text NOT NULL CHECK(artifact_sha256 ~ '^[a-f0-9]{64}$'),
 created_by text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(document_id,client_id,organization_id) REFERENCES guest_document(id,client_id,organization_id),
 UNIQUE(document_id,version), UNIQUE(id,client_id,organization_id)
);
CREATE TABLE guest_approval (
 id uuid PRIMARY KEY, version_id uuid NOT NULL, recipient_id uuid NOT NULL,
 client_id uuid NOT NULL, organization_id text NOT NULL, approved_by text NOT NULL REFERENCES "user"(id),
 recipient_email text NOT NULL, preview_sha256 text NOT NULL CHECK(preview_sha256 ~ '^[a-f0-9]{64}$'),
 message_snapshot jsonb NOT NULL CHECK(jsonb_typeof(message_snapshot)='object'),
 expires_at timestamptz NOT NULL, approved_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(version_id,client_id,organization_id) REFERENCES guest_version(id,client_id,organization_id),
 FOREIGN KEY(recipient_id,client_id,organization_id) REFERENCES guest_recipient(id,client_id,organization_id),
 CHECK(expires_at>approved_at AND expires_at<=approved_at+interval '30 days')
);
CREATE TABLE guest_dispatch (
 id uuid PRIMARY KEY, approval_id uuid NOT NULL UNIQUE REFERENCES guest_approval(id),
 status text NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','revoked')),
 generation integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
 CHECK((status='prepared' AND revoked_at IS NULL) OR (status='revoked' AND revoked_at IS NOT NULL))
);
CREATE TABLE guest_audit (
 id uuid PRIMARY KEY, organization_id text NOT NULL REFERENCES organization(id),
 actor_id text NOT NULL REFERENCES "user"(id), subject_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('version_created','approved','dispatch_prepared','revoked')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION guest_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Guest document binding is immutable' USING ERRCODE='42501'; END $$;
CREATE TRIGGER guest_version_immutable BEFORE UPDATE OR DELETE ON guest_version FOR EACH ROW EXECUTE FUNCTION guest_immutable();
CREATE TRIGGER guest_approval_immutable BEFORE UPDATE OR DELETE ON guest_approval FOR EACH ROW EXECUTE FUNCTION guest_immutable();
CREATE TRIGGER guest_audit_immutable BEFORE UPDATE OR DELETE ON guest_audit FOR EACH ROW EXECUTE FUNCTION guest_immutable();
-- Changing recipient/client ownership requires a new record and revoking old dispatches.
CREATE TRIGGER guest_recipient_immutable BEFORE UPDATE OR DELETE ON guest_recipient FOR EACH ROW EXECUTE FUNCTION guest_immutable();
CREATE TRIGGER guest_document_immutable BEFORE UPDATE OR DELETE ON guest_document FOR EACH ROW EXECUTE FUNCTION guest_immutable();
CREATE TRIGGER guest_client_immutable BEFORE UPDATE OR DELETE ON guest_client FOR EACH ROW EXECUTE FUNCTION guest_immutable();
CREATE FUNCTION guest_dispatch_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.approval_id IS DISTINCT FROM OLD.approval_id OR NEW.created_at IS DISTINCT FROM OLD.created_at
 OR OLD.status<>'prepared' OR NEW.status<>'revoked' OR NEW.generation<>OLD.generation+1 OR NEW.revoked_at IS NULL THEN
  RAISE EXCEPTION 'Invalid dispatch transition' USING ERRCODE='42501';
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER guest_dispatch_transition BEFORE UPDATE ON guest_dispatch FOR EACH ROW EXECUTE FUNCTION guest_dispatch_transition();
CREATE TRIGGER guest_dispatch_no_delete BEFORE DELETE ON guest_dispatch FOR EACH ROW EXECUTE FUNCTION guest_immutable();
REVOKE ALL ON guest_client,guest_recipient,guest_document,guest_version,guest_approval,guest_dispatch,guest_audit FROM PUBLIC;
GRANT SELECT,INSERT ON guest_client,guest_recipient,guest_document,guest_version,guest_approval,guest_dispatch,guest_audit TO gc_app;
GRANT UPDATE(status,generation,revoked_at) ON guest_dispatch TO gc_app;
REVOKE ALL ON FUNCTION guest_project_scope(),guest_immutable(),guest_dispatch_transition() FROM PUBLIC;
-- PostgreSQL row locks need an UPDATE privilege; immutable triggers still reject
-- every actual update. Limit the privilege to the ID column, not record contents.
GRANT UPDATE(id) ON guest_document,guest_approval TO gc_app;
CREATE TABLE gc_atrium.guest_access (
 dispatch_id uuid PRIMARY KEY REFERENCES gc_atrium.guest_dispatch(id),
 share_hash text NOT NULL UNIQUE CHECK(share_hash ~ '^[a-f0-9]{64}$'),
 salt bytea NOT NULL CHECK(octet_length(salt)=16), pin_hash bytea NOT NULL CHECK(octet_length(pin_hash)=32),
 generation integer NOT NULL DEFAULT 0 CHECK(generation>=0)
);
CREATE TABLE gc_atrium.guest_session (
 token_hash text PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 dispatch_id uuid NOT NULL REFERENCES gc_atrium.guest_access(dispatch_id),
 generation integer NOT NULL, csrf_hash text NOT NULL CHECK(csrf_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL
);
CREATE TABLE gc_atrium.guest_attempt (
 bucket text PRIMARY KEY, attempts integer NOT NULL CHECK(attempts>0), resets_at timestamptz NOT NULL
);
CREATE TABLE gc_atrium.guest_access_audit (
 id uuid PRIMARY KEY, dispatch_id uuid NOT NULL REFERENCES gc_atrium.guest_dispatch(id),
 action text NOT NULL CHECK(action IN ('pin_issued','pin_rotated','unlocked','logout')), created_at timestamptz NOT NULL DEFAULT now(),
 actor_id text REFERENCES gc_atrium."user"(id),
 CHECK((action IN ('pin_issued','pin_rotated') AND actor_id IS NOT NULL) OR (action IN ('unlocked','logout') AND actor_id IS NULL))
);
CREATE TRIGGER guest_access_audit_immutable BEFORE UPDATE OR DELETE ON gc_atrium.guest_access_audit FOR EACH ROW EXECUTE FUNCTION gc_atrium.guest_immutable();
GRANT SELECT,INSERT,UPDATE ON gc_atrium.guest_access,gc_atrium.guest_attempt TO gc_app;
GRANT SELECT,INSERT,DELETE ON gc_atrium.guest_session TO gc_app;
GRANT SELECT,INSERT ON gc_atrium.guest_access_audit TO gc_app;

-- Authenticated, size/type-checked, read-back-verified uploads enter the registry.
CREATE TABLE gc_atrium.guest_artifact (
 storage_key text PRIMARY KEY CHECK(storage_key ~ '^guest-documents/[a-f0-9-]{36}\.pdf$'),
 organization_id text NOT NULL REFERENCES gc_atrium.organization(id),
 project_id text NOT NULL REFERENCES gc_atrium.project(id),
 document_id uuid NOT NULL REFERENCES gc_atrium.guest_document(id),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 byte_length integer NOT NULL CHECK(byte_length BETWEEN 8 AND 3145728),
 policy text NOT NULL CHECK(policy='gc-pdf-upload-v1'),
 created_by text NOT NULL REFERENCES gc_atrium."user"(id), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(document_id,organization_id,project_id) REFERENCES gc_atrium.guest_document(id,organization_id,project_id)
);
CREATE TRIGGER guest_artifact_immutable BEFORE UPDATE OR DELETE ON gc_atrium.guest_artifact FOR EACH ROW EXECUTE FUNCTION gc_atrium.guest_immutable();
GRANT SELECT,INSERT ON gc_atrium.guest_artifact TO gc_app;
