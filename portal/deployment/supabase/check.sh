#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
container="growthcast-isolation-check-$$"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT HUP INT TERM
# Disposable container, no published ports, no host packages or cloud credentials.
docker run -d --name "$container" --network none -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_USER=fixture_root -e POSTGRES_DB=postgres -v "$root:/checks:ro" postgres:17-alpine@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73 >/dev/null
for attempt in 1 2 3 4 5 6 7 8 9 10; do
 if docker logs "$container" 2>&1 | grep -q "PostgreSQL init process complete" && docker exec "$container" pg_isready -U fixture_root >/dev/null 2>&1; then break; fi
 sleep 1
done
docker exec "$container" psql -U fixture_root -d postgres -v ON_ERROR_STOP=1 -c 'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE postgres LOGIN NOSUPERUSER CREATEROLE CREATEDB NOINHERIT; ALTER DATABASE postgres OWNER TO postgres; GRANT anon,authenticated,service_role TO postgres WITH SET TRUE, INHERIT FALSE;'
docker exec "$container" psql -U postgres -v ON_ERROR_STOP=1 -f /checks/isolation.sql
docker exec "$container" psql -U postgres -v ON_ERROR_STOP=1 -f /checks/isolation.sql
docker exec "$container" psql -U postgres -v ON_ERROR_STOP=1 -f /checks/isolation-check.sql
# Refuse to rerun the empty-project bootstrap after application objects exist.
docker exec "$container" psql -U postgres -v ON_ERROR_STOP=1 -c 'SET ROLE gc_migrate; CREATE TABLE gc_atrium.existing_application(id int);'
if docker exec "$container" psql -U postgres -v ON_ERROR_STOP=1 -f /checks/isolation.sql >/dev/null 2>&1; then
 echo 'ERROR: populated schema was accepted' >&2; exit 1
fi
docker exec "$container" psql -U postgres -v ON_ERROR_STOP=1 -c 'SET ROLE gc_migrate; SELECT count(*) FROM gc_atrium.existing_application;'
echo 'Populated-schema refusal passed; existing table preserved.'
