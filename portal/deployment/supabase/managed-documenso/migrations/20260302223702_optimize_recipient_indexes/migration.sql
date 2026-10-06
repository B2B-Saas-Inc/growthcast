-- CreateExtension
-- pg_trgm is pre-provisioned in extensions by the administrator.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Recipient_email_documentDeletedAt_envelopeId_idx" ON "Recipient"("email", "documentDeletedAt", "envelopeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Recipient_email_envelopeId_idx" ON "Recipient"("email", "envelopeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Recipient_email_signingStatus_envelopeId_role_idx" ON "Recipient"("email", "signingStatus", "envelopeId", "role");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Recipient_email_trgm_idx" ON "Recipient" USING GIN ("email" extensions.gin_trgm_ops);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Recipient_name_trgm_idx" ON "Recipient" USING GIN ("name" extensions.gin_trgm_ops);
