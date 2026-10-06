-- Additive migration011: editable catalog labels and removal without destroying signed history.
CREATE TABLE gc_atrium.guest_catalog_state (
 entity text NOT NULL CHECK(entity IN ('clients','recipients','documents')), id uuid NOT NULL,
 organization_id text NOT NULL REFERENCES gc_atrium.organization(id),
 label text CHECK(label IS NULL OR (length(label) BETWEEN 1 AND 200 AND label=btrim(label))),
 deleted_at timestamptz, updated_by text NOT NULL REFERENCES gc_atrium."user"(id),
 PRIMARY KEY(entity,id), CHECK(entity<>'recipients' OR label IS NULL)
);
CREATE TABLE gc_atrium.guest_catalog_event (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, entity text NOT NULL, subject_id uuid NOT NULL,
 organization_id text NOT NULL, actor_id text NOT NULL, action text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER guest_catalog_event_immutable BEFORE UPDATE OR DELETE ON gc_atrium.guest_catalog_event
 FOR EACH ROW EXECUTE FUNCTION gc_atrium.guest_immutable();
CREATE FUNCTION gc_atrium.guest_catalog_scope() RETURNS trigger LANGUAGE plpgsql SET search_path=gc_atrium,pg_catalog AS $$
DECLARE owned boolean;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Catalog history is retained' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND ((NEW.entity,NEW.id,NEW.organization_id) IS DISTINCT FROM (OLD.entity,OLD.id,OLD.organization_id) OR (OLD.deleted_at IS NOT NULL AND NOT(OLD.entity='recipients' AND NEW.deleted_at IS NULL))) THEN
  RAISE EXCEPTION 'Catalog scope is immutable' USING ERRCODE='42501';
 END IF;
 SELECT CASE NEW.entity
  WHEN 'clients' THEN EXISTS(SELECT 1 FROM guest_client WHERE id=NEW.id AND organization_id=NEW.organization_id)
  WHEN 'recipients' THEN EXISTS(SELECT 1 FROM guest_recipient WHERE id=NEW.id AND organization_id=NEW.organization_id)
  WHEN 'documents' THEN EXISTS(SELECT 1 FROM guest_document WHERE id=NEW.id AND organization_id=NEW.organization_id)
  ELSE false END INTO owned;
 IF NOT owned THEN RAISE EXCEPTION 'Catalog scope mismatch' USING ERRCODE='42501'; END IF;
 IF NEW.deleted_at IS NOT NULL THEN
  UPDATE guest_dispatch d SET status='revoked',generation=d.generation+1,revoked_at=clock_timestamp()
   FROM guest_approval a JOIN guest_version v ON v.id=a.version_id
   WHERE d.approval_id=a.id AND a.organization_id=NEW.organization_id AND d.status='prepared'
    AND CASE NEW.entity WHEN 'clients' THEN a.client_id=NEW.id WHEN 'recipients' THEN a.recipient_id=NEW.id ELSE v.document_id=NEW.id END;
 END IF;
 INSERT INTO guest_catalog_event(entity,subject_id,organization_id,actor_id,action)
 VALUES(NEW.entity,NEW.id,NEW.organization_id,NEW.updated_by,CASE WHEN NEW.deleted_at IS NOT NULL THEN 'deleted' ELSE 'edited' END);
 RETURN NEW;
END $$;
CREATE TRIGGER guest_catalog_scope BEFORE INSERT OR UPDATE OR DELETE ON gc_atrium.guest_catalog_state
 FOR EACH ROW EXECUTE FUNCTION gc_atrium.guest_catalog_scope();
REVOKE ALL ON gc_atrium.guest_catalog_state,gc_atrium.guest_catalog_event FROM PUBLIC;
REVOKE ALL ON FUNCTION gc_atrium.guest_catalog_scope() FROM PUBLIC;
GRANT SELECT,INSERT ON gc_atrium.guest_catalog_state,gc_atrium.guest_catalog_event TO gc_app;
GRANT UPDATE(label,deleted_at,updated_by) ON gc_atrium.guest_catalog_state TO gc_app;
GRANT USAGE ON SEQUENCE gc_atrium.guest_catalog_event_id_seq TO gc_app;
