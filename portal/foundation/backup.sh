#!/bin/sh
set -eu
export PGUSER=gc_migrate PGDATABASE=foundation_test PGSSLMODE=verify-full PGSSLROOTCERT=/ca/server.crt
PGPASSWORD=$(cat /credential/password)
export PGPASSWORD
pg_dump -h database --format=custom --no-owner --file=/backups/database.dump
# Source fixture writers have stopped before this bounded snapshot.
tar -C /artifacts -czf /backups/artifacts.tgz .
(cd /backups && sha256sum database.dump artifacts.tgz > SHA256SUMS)
(cd /backups && sha256sum -c SHA256SUMS)
psql -h restore -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF current_database()<>'foundation_test' OR EXISTS(SELECT 1 FROM pg_tables WHERE schemaname IN ('public','portal_meta')) THEN
    RAISE EXCEPTION 'Empty disposable restore target required';
  END IF;
END $$;
DROP SCHEMA portal_meta;
-- pg_dump treats public as an existing standard schema; preserve it.
SQL
pg_restore -h restore --no-owner --exit-on-error --single-transaction --dbname=foundation_test /backups/database.dump
tar -C /restored-artifacts -xzf /backups/artifacts.tgz
printf '%s\n' 'Database and artifact snapshot restored into the separate empty recovery target.'
