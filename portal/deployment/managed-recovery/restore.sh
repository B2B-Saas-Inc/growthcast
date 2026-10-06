#!/bin/sh
set -eu
export PGHOST="${PGHOST:-target}"
count=$(psql -U postgres -d postgres -Atc "SELECT count(*) FROM pg_database WHERE datname='restored_portal'")
[ "$count" = 0 ] || { echo 'Restore target is not empty' >&2; exit 1; }
tar -C /restored -xf /restored/bundle.tar
(cd /restored && sha256sum -c SHA256SUMS)
createdb -U postgres restored_portal
psql -U postgres -d restored_portal -v ON_ERROR_STOP=1 -c 'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE gc_backup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;'
psql -U postgres -d restored_portal -v ON_ERROR_STOP=1 -f /app/deployment/supabase/isolation.sql
psql -U postgres -d restored_portal -v ON_ERROR_STOP=1 -c 'CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; CREATE EXTENSION pg_trgm WITH SCHEMA extensions; GRANT USAGE ON SCHEMA extensions TO gc_documenso_migrate,gc_documenso;'
for name in atrium documenso; do
 if [ "$name" = atrium ]; then role=gc_migrate; else role=gc_documenso_migrate; fi
 pg_restore --list "/restored/$name.dump" | sed -E '/^[0-9]+; [0-9]+ [0-9]+ SCHEMA - (gc_atrium|gc_documenso|portal_meta) /d' > "${TMPDIR:-/tmp}/$name.list"
 pg_restore -U postgres --role="$role" -d restored_portal --no-owner --use-list="${TMPDIR:-/tmp}/$name.list" --exit-on-error --single-transaction "/restored/$name.dump"
done
node /app/deployment/managed-recovery/verify.mjs restore-object
