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
