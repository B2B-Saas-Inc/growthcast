-- Additive candidate migration 013. Never modify deployed migration 010.
CREATE TABLE gc_atrium.guest_send (
 id uuid PRIMARY KEY, dispatch_id uuid NOT NULL UNIQUE REFERENCES gc_atrium.guest_dispatch(id),
 approval_id uuid NOT NULL UNIQUE REFERENCES gc_atrium.guest_approval(id),
 version_id uuid NOT NULL REFERENCES gc_atrium.guest_version(id),
 recipient_id uuid NOT NULL REFERENCES gc_atrium.guest_recipient(id),
 organization_id text NOT NULL REFERENCES gc_atrium.organization(id),
 requested_by text NOT NULL REFERENCES gc_atrium."user"(id),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','creating','created','configuring','configured','activating','active','grant_creating','ready','link_sending','link_sent','pin_sending','sent','needs_review','revoked')),
 envelope_id text UNIQUE, binding_ciphertext text, access_ciphertext text,
 lease_id uuid, lease_until timestamptz,
 failure_code text CHECK(failure_code IN ('interrupted','provider_unavailable','access_unavailable','mail_uncertain','approval_unavailable')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(version_id,recipient_id),
 CHECK((lease_id IS NULL)=(lease_until IS NULL)),
 CHECK(access_ciphertext IS NULL OR length(access_ciphertext)<32768),
 CHECK(binding_ciphertext IS NULL OR length(binding_ciphertext)<65536)
);
CREATE TABLE gc_atrium.guest_send_event (
 id uuid PRIMARY KEY, send_id uuid NOT NULL REFERENCES gc_atrium.guest_send(id),
 status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER guest_send_event_immutable BEFORE UPDATE OR DELETE ON gc_atrium.guest_send_event
 FOR EACH ROW EXECUTE FUNCTION gc_atrium.guest_immutable();
CREATE FUNCTION gc_atrium.guest_send_scope() RETURNS trigger LANGUAGE plpgsql SET search_path=gc_atrium,pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM guest_dispatch d JOIN guest_approval a ON a.id=d.approval_id
  WHERE d.id=NEW.dispatch_id AND a.id=NEW.approval_id AND a.version_id=NEW.version_id
  AND a.recipient_id=NEW.recipient_id AND a.organization_id=NEW.organization_id) THEN
  RAISE EXCEPTION 'Send scope mismatch' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.id,NEW.dispatch_id,NEW.approval_id,NEW.version_id,NEW.recipient_id,NEW.organization_id,NEW.requested_by,NEW.created_at)
 IS DISTINCT FROM (OLD.id,OLD.dispatch_id,OLD.approval_id,OLD.version_id,OLD.recipient_id,OLD.organization_id,OLD.requested_by,OLD.created_at) THEN
  RAISE EXCEPTION 'Send scope is immutable' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NOT (
  (OLD.status NOT IN ('sent','revoked') AND NEW.status='revoked') OR
  (OLD.status NOT IN ('sent','needs_review','revoked') AND NEW.status='needs_review') OR
  (OLD.status,NEW.status) IN (('queued','creating'),('creating','created'),('created','configuring'),('configuring','configured'),('configured','activating'),('activating','active'),('active','grant_creating'),('grant_creating','ready'),('ready','link_sending'),('link_sending','link_sent'),('link_sent','pin_sending'),('pin_sending','sent'))
 ) THEN RAISE EXCEPTION 'Invalid send transition' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND OLD.envelope_id IS NOT NULL AND NEW.envelope_id IS DISTINCT FROM OLD.envelope_id THEN
  RAISE EXCEPTION 'Provider envelope is immutable' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guest_send_scope BEFORE INSERT OR UPDATE ON gc_atrium.guest_send
 FOR EACH ROW EXECUTE FUNCTION gc_atrium.guest_send_scope();
REVOKE ALL ON gc_atrium.guest_send,gc_atrium.guest_send_event FROM PUBLIC;
REVOKE ALL ON FUNCTION gc_atrium.guest_send_scope() FROM PUBLIC;
GRANT SELECT,INSERT ON gc_atrium.guest_send,gc_atrium.guest_send_event TO gc_app;
GRANT UPDATE(status,envelope_id,binding_ciphertext,access_ciphertext,lease_id,lease_until,failure_code,updated_at) ON gc_atrium.guest_send TO gc_app;
CREATE TABLE gc_atrium.guest_send_grant (
 send_id uuid PRIMARY KEY REFERENCES gc_atrium.guest_send(id),
 grant_id uuid NOT NULL UNIQUE REFERENCES gc_atrium.grants(id)
);
CREATE TRIGGER guest_send_grant_immutable BEFORE UPDATE OR DELETE ON gc_atrium.guest_send_grant
 FOR EACH ROW EXECUTE FUNCTION gc_atrium.guest_immutable();
REVOKE ALL ON gc_atrium.guest_send_grant FROM PUBLIC;
GRANT SELECT,INSERT ON gc_atrium.guest_send_grant TO gc_app;
CREATE FUNCTION gc_atrium.guest_send_grant_scope() RETURNS trigger LANGUAGE plpgsql SET search_path=gc_atrium,pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM guest_send s JOIN guest_approval a ON a.id=s.approval_id
  JOIN grants g ON g.id=NEW.grant_id WHERE s.id=NEW.send_id AND s.status='grant_creating'
  AND g.binding->>'organizationId'=s.organization_id AND g.binding->>'clientId'=a.client_id::text
  AND g.binding->>'documentVersion'=s.version_id::text AND g.binding->>'envelopeId'=s.envelope_id
  AND g.binding->>'recipientEmail'=a.recipient_email) THEN
  RAISE EXCEPTION 'Delivery gateway scope mismatch' USING ERRCODE='42501';
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER guest_send_grant_scope BEFORE INSERT ON gc_atrium.guest_send_grant
 FOR EACH ROW EXECUTE FUNCTION gc_atrium.guest_send_grant_scope();
REVOKE ALL ON FUNCTION gc_atrium.guest_send_grant_scope() FROM PUBLIC;
CREATE TABLE gc_atrium.guest_completed (
 send_id uuid PRIMARY KEY REFERENCES gc_atrium.guest_send(id),
 file_id text NOT NULL UNIQUE REFERENCES gc_atrium.file(id),
 document_id text NOT NULL UNIQUE REFERENCES gc_atrium.document(id),
 storage_key text NOT NULL UNIQUE, item_id text NOT NULL, data_id text NOT NULL,
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 completed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER guest_completed_immutable BEFORE UPDATE OR DELETE ON gc_atrium.guest_completed
 FOR EACH ROW EXECUTE FUNCTION gc_atrium.guest_immutable();
REVOKE ALL ON gc_atrium.guest_completed FROM PUBLIC;
GRANT SELECT ON gc_atrium.guest_completed TO gc_app,gc_lifecycle;
-- Only the existing trusted lifecycle role can publish canonical completion.
-- HTTP staff/guest roles have no execute grant and cannot manufacture Signed.
CREATE FUNCTION gc_atrium.publish_guest_completion(target uuid,item text,data text,sha text,byte_size integer)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=gc_atrium,pg_catalog AS $$
DECLARE bound record; existing record; file_ref text; document_ref text; object_key text;
BEGIN
 IF sha !~ '^[a-f0-9]{64}$' OR item !~ '^[A-Za-z0-9_-]{1,160}$' OR data !~ '^[A-Za-z0-9_-]{1,160}$' OR byte_size NOT BETWEEN 8 AND 16777216 THEN
  RAISE EXCEPTION 'Invalid completed artifact' USING ERRCODE='42501';
 END IF;
 SELECT s.*,v.title,v.artifact_sha256,doc.project_id,doc.kind,link.grant_id,g.binding INTO bound
 FROM guest_send s JOIN guest_approval a ON a.id=s.approval_id JOIN guest_version v ON v.id=a.version_id
 JOIN guest_document doc ON doc.id=v.document_id JOIN project p ON p.id=doc.project_id
 JOIN guest_dispatch dispatch ON dispatch.id=s.dispatch_id
 JOIN guest_send_grant link ON link.send_id=s.id JOIN grants g ON g.id=link.grant_id
 WHERE s.id=target AND s.status='sent' AND dispatch.status='prepared'
 AND p."organizationId"=s.organization_id AND p."archivedAt" IS NULL
 FOR UPDATE OF s FOR SHARE OF p;
 IF NOT FOUND OR bound.binding->>'envelopeId'<>bound.envelope_id OR bound.binding->>'documentVersion'<>bound.version_id::text
 OR jsonb_array_length(bound.binding->'items')<>1 OR bound.binding->'items'->0->>'id'<>item THEN
  RAISE EXCEPTION 'Completed document scope unavailable' USING ERRCODE='42501';
 END IF;
 SELECT * INTO existing FROM guest_completed WHERE send_id=target;
 IF FOUND THEN
  IF existing.sha256<>sha OR existing.item_id<>item OR existing.data_id<>data THEN RAISE EXCEPTION 'Completed artifact changed' USING ERRCODE='42501'; END IF;
  RETURN existing.document_id;
 END IF;
 file_ref:='guest-signed-file-'||target::text;document_ref:='guest-signed-'||target::text;object_key:='guest-executed/'||target::text||'.pdf';
 INSERT INTO file(id,filename,type,"storageKey","mimeType","sizeBytes","projectId","organizationId","uploadedById","updatedAt")
 VALUES(file_ref,bound.title||' — signed.pdf','UPLOAD',object_key,'application/pdf',byte_size,bound.project_id,bound.organization_id,bound.requested_by,now());
 INSERT INTO document(id,type,title,"fileId","signedFileId","projectId","organizationId","uploadedById",status,"requiresSignature","requiresApproval","updatedAt")
 VALUES(document_ref,CASE bound.kind WHEN 'proposal' THEN 'quote' WHEN 'supporting' THEN 'other' ELSE bound.kind END,bound.title,file_ref,file_ref,bound.project_id,bound.organization_id,bound.requested_by,'signed',false,false,now());
 INSERT INTO provider_documents(document_id,provider,external_id) VALUES(document_ref,'documenso',bound.envelope_id);
 INSERT INTO sealed_artifacts(grant_id,item_id,data_id,sha256) VALUES(bound.grant_id,item,data,sha);
 INSERT INTO provider_completions(document_id,grant_id,item_id,data_id,sha256) VALUES(document_ref,bound.grant_id,item,data,sha);
 INSERT INTO guest_completed(send_id,file_id,document_id,storage_key,item_id,data_id,sha256) VALUES(target,file_ref,document_ref,object_key,item,data,sha);
 RETURN document_ref;
END $$;
REVOKE ALL ON FUNCTION gc_atrium.publish_guest_completion(uuid,text,text,text,integer) FROM PUBLIC,gc_app;
GRANT EXECUTE ON FUNCTION gc_atrium.publish_guest_completion(uuid,text,text,text,integer) TO gc_lifecycle;

-- Lifecycle polling reads only pending bindings, not recipient PINs or staff data.
-- Keyset pagination prevents an unsigned first page from starving later sends.
CREATE FUNCTION gc_atrium.guest_pending_completions(after_id uuid DEFAULT NULL)
 RETURNS TABLE(id uuid,binding_ciphertext text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=gc_atrium,pg_catalog AS $$
 SELECT s.id,s.binding_ciphertext FROM guest_send s
 JOIN guest_dispatch d ON d.id=s.dispatch_id
 JOIN guest_send_grant link ON link.send_id=s.id
 WHERE s.status='sent' AND d.status='prepared' AND s.binding_ciphertext IS NOT NULL
 AND (after_id IS NULL OR s.id>after_id)
 AND NOT EXISTS(SELECT 1 FROM guest_completed c WHERE c.send_id=s.id)
 ORDER BY s.id LIMIT 25
$$;
REVOKE ALL ON FUNCTION gc_atrium.guest_pending_completions(uuid) FROM PUBLIC,gc_app,gc_gateway;
GRANT EXECUTE ON FUNCTION gc_atrium.guest_pending_completions(uuid) TO gc_lifecycle;

-- Public gateway checks eligibility without gaining access to client/project tables.
CREATE FUNCTION gc_atrium.guest_gateway_active(grant_id uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=gc_atrium,pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM guest_send_grant link
 JOIN guest_send s ON s.id=link.send_id JOIN guest_dispatch d ON d.id=s.dispatch_id
 JOIN guest_approval a ON a.id=s.approval_id JOIN guest_version v ON v.id=a.version_id
 JOIN guest_document doc ON doc.id=v.document_id JOIN project p ON p.id=doc.project_id
 WHERE link.grant_id=$1 AND s.status IN ('ready','link_sending','link_sent','pin_sending','sent')
 AND d.status='prepared' AND a.expires_at>clock_timestamp()
 AND p."organizationId"=s.organization_id AND p."archivedAt" IS NULL)
$$;
REVOKE ALL ON FUNCTION gc_atrium.guest_gateway_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gc_atrium.guest_gateway_active(uuid) TO gc_app,gc_gateway;
-- Recipient gateway can rate-limit and exchange PINs, but cannot issue/rotate grants.
GRANT SELECT ON gc_atrium.pin_shares,gc_atrium.pin_attempts TO gc_gateway;
GRANT INSERT ON gc_atrium.pin_attempts,gc_atrium.handoffs TO gc_gateway;
GRANT UPDATE(attempts,resets_at) ON gc_atrium.pin_attempts TO gc_gateway;
