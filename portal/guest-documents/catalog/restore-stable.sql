-- Migration012: preserve the label rule across PostgreSQL dump/restore parsing.
-- BETWEEN introduces a nested AND that pg_get_constraintdef flattens on restore.
ALTER TABLE gc_atrium.guest_catalog_state DROP CONSTRAINT guest_catalog_state_label_check;
ALTER TABLE gc_atrium.guest_catalog_state ADD CONSTRAINT guest_catalog_state_label_check
 CHECK(label IS NULL OR (length(label)>=1 AND length(label)<=200 AND label=btrim(label)));
