-- Private workspace originals; project shares are independent existing file records.
CREATE TABLE gc_atrium.library_file (
 id text PRIMARY KEY,
 "organizationId" text NOT NULL REFERENCES gc_atrium.organization(id) ON DELETE CASCADE,
 filename text NOT NULL,
 "storageKey" text NOT NULL UNIQUE,
 "mimeType" text NOT NULL,
 "sizeBytes" integer NOT NULL CHECK ("sizeBytes" BETWEEN 1 AND 2097152),
 sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
 "uploadedById" text NOT NULL REFERENCES gc_atrium."user"(id),
 "createdAt" timestamptz NOT NULL DEFAULT now(),
 "archivedAt" timestamptz
);
CREATE INDEX library_file_org_idx ON gc_atrium.library_file ("organizationId", "createdAt");
CREATE TABLE gc_atrium.library_share (
 "libraryId" text NOT NULL REFERENCES gc_atrium.library_file(id) ON DELETE CASCADE,
 "projectId" text NOT NULL REFERENCES gc_atrium.project(id) ON DELETE CASCADE,
 "fileId" text NOT NULL UNIQUE REFERENCES gc_atrium.file(id) ON DELETE CASCADE,
 PRIMARY KEY ("libraryId", "projectId")
);
REVOKE ALL ON gc_atrium.library_file, gc_atrium.library_share FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON gc_atrium.library_file, gc_atrium.library_share TO gc_app;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gc_backup') THEN GRANT SELECT ON gc_atrium.library_file, gc_atrium.library_share TO gc_backup; END IF; END $$;
-- Correct only untouched pending uploads with no requested client action.
-- Preserve signature fields, tokens, responses, completed history and deliberate drafts.
WITH changed AS (
 UPDATE gc_atrium.document d SET status='uploaded', "reminderEnabled"=false, "expiresAt"=NULL, "updatedAt"=now()
 WHERE status='pending' AND NOT "requiresSignature" AND NOT "requiresApproval"
 AND NULLIF(btrim(options),'') IS NULL AND "signedFileId" IS NULL
 AND NOT EXISTS (SELECT 1 FROM gc_atrium.provider_documents p WHERE p.document_id=d.id)
 AND NOT EXISTS (SELECT 1 FROM gc_atrium.document_response r WHERE r."documentId"=d.id)
 AND NOT EXISTS (SELECT 1 FROM gc_atrium.signature_field f WHERE f."documentId"=d.id)
 AND NOT EXISTS (SELECT 1 FROM gc_atrium.document_access_token t WHERE t."documentId"=d.id)
 RETURNING id
)
INSERT INTO gc_atrium.document_audit_event (id,"documentId",action,"createdAt")
 SELECT 'upload-status-'||id,id,'upload_status_corrected',now() FROM changed;
