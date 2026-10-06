#!/bin/sh
set -eu
export PGUSER=gc_migrate PGDATABASE=foundation_test PGSSLMODE=verify-full PGSSLROOTCERT=/ca/server.crt
PGPASSWORD=$(cat /credential/password)
export PGPASSWORD
pg_dump -h database --schema=gc_atrium --schema=portal_meta --format=custom --no-owner --file=/backups/database.dump
# Source fixture writers have stopped before this bounded snapshot.
tar -C /artifacts -czf /backups/artifacts.tgz .
(cd /backups && sha256sum database.dump artifacts.tgz > SHA256SUMS)
(cd /backups && sha256sum -c SHA256SUMS)
psql -h restore -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF current_database()<>'foundation_test' OR EXISTS(SELECT 1 FROM pg_tables WHERE schemaname IN ('gc_atrium','portal_meta')) THEN
    RAISE EXCEPTION 'Empty disposable restore target required';
  END IF;
END $$;
-- Preserve administrator-provisioned empty schemas and their ownership.
SQL
pg_restore --list /backups/database.dump | sed -E '/^[0-9]+; [0-9]+ [0-9]+ SCHEMA - (gc_atrium|portal_meta) /d' > /backups/restore.list
pg_restore -h restore --use-list=/backups/restore.list --no-owner --exit-on-error --single-transaction --dbname=foundation_test /backups/database.dump
tar -C /restored-artifacts -xzf /backups/artifacts.tgz
printf '%s\n' 'Database and artifact snapshot restored into the separate empty recovery target.'
