-- Runtime may operate ordinary Atrium entities but cannot write provider truth,
-- change ownership registries, or bypass the lifecycle's scoped functions.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO gc_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gc_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gc_app;
REVOKE ALL ON provider_documents, provider_invoices, sealed_artifacts, provider_completions, lifecycle_jobs FROM gc_app;
GRANT SELECT ON provider_documents, provider_invoices, sealed_artifacts, provider_completions TO gc_app;
GRANT USAGE ON SCHEMA portal_meta TO gc_app;
GRANT SELECT ON ALL TABLES IN SCHEMA portal_meta TO gc_app;
