#!/bin/sh
set -eu
# Refuse existing application schemas before creating or restoring any database.
count=$(psql -h recovery-db -U postgres -d postgres -Atc "SELECT count(*) FROM pg_database WHERE datname IN ('documenso_test','gateway_test')")
[ "$count" = 0 ] || { echo 'Restore target is not empty' >&2; exit 1; }
tar -C /restored -xf /restored/bundle.tar
(cd /restored && sha256sum -c SHA256SUMS)
createdb -h recovery-db -U postgres documenso_test
createdb -h recovery-db -U postgres gateway_test
# Provision fresh role/schema ownership before restoring application objects.
psql -h recovery-db -U postgres -d documenso_test -v ON_ERROR_STOP=1 -c 'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;'
psql -h recovery-db -U postgres -d documenso_test -v ON_ERROR_STOP=1 -f /fixture/isolation.sql
psql -h recovery-db -U postgres -d documenso_test -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION pg_trgm WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO gc_documenso_migrate,gc_documenso;
-- Disposable recovery network uses trust auth; no live credentials are restored.
ALTER ROLE gc_documenso LOGIN;
SET ROLE gc_migrate;
CREATE TABLE gc_atrium.restore_decoy(value text);
INSERT INTO gc_atrium.restore_decoy VALUES ('preserve-unrelated-namespace');
RESET ROLE;
SQL
# Keep the administrator-provisioned schema; all restored objects belong to the migration role.
pg_restore --list /restored/documenso.dump | sed -E '/^[0-9]+; [0-9]+ [0-9]+ SCHEMA - gc_documenso /d' > /tmp/provider-restore.list
pg_restore -h recovery-db -U postgres --role=gc_documenso_migrate -d documenso_test --no-owner --use-list=/tmp/provider-restore.list --exit-on-error --single-transaction /restored/documenso.dump
pg_restore -h recovery-db -U postgres -d gateway_test --no-owner --no-acl --exit-on-error --single-transaction /restored/gateway.dump

psql -h recovery-db -U postgres -d documenso_test -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF (SELECT count(*) FROM gc_atrium.restore_decoy WHERE value='preserve-unrelated-namespace') <> 1 THEN
  RAISE EXCEPTION 'Unrelated namespace changed during provider restore';
 END IF;
END $$;
SQL
