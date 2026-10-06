-- Version the schema guard; physical dropped-column slots are not logical drift.
ALTER TABLE gc_documenso._growthcast_schema_state
 ADD COLUMN fingerprint_version integer NOT NULL DEFAULT 2 CHECK (fingerprint_version=2);
