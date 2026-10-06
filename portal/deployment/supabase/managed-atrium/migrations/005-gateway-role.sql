-- Dedicated HTTP gateway identity: no grant issuance, canonical writes or DDL.
GRANT USAGE ON SCHEMA gc_atrium TO gc_gateway;
GRANT SELECT ON grants,handoffs,sessions,account_grants,sealed_artifacts,provider_documents,provider_completions,"session","user",member,project,project_client,document TO gc_gateway;
GRANT INSERT ON sessions TO gc_gateway;
GRANT UPDATE(consumed_at) ON handoffs TO gc_gateway;
-- PostgreSQL row locking requires UPDATE privilege on at least one column.
-- The existing immutable-binding trigger rejects every actual binding change;
-- this permits the store's FOR UPDATE lock without granting revocation/expiry writes.
GRANT UPDATE(binding) ON grants TO gc_gateway;
GRANT USAGE ON SCHEMA portal_meta TO gc_gateway,gc_lifecycle;
GRANT SELECT ON ALL TABLES IN SCHEMA portal_meta TO gc_gateway,gc_lifecycle;
