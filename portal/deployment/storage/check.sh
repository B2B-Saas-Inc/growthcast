#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
container="growthcast-storage-policy-$$"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT HUP INT TERM
docker run -d --name "$container" --network none -e POSTGRES_HOST_AUTH_METHOD=trust -v "$root:/checks:ro" postgres:17-alpine@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73 >/dev/null
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if docker logs "$container" 2>&1 | grep -q 'PostgreSQL init process complete' && docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$container" psql -U postgres -v ON_ERROR_STOP=1 -f /checks/policy.check.sql
if docker exec "$container" psql -U postgres -v ON_ERROR_STOP=1 -c "SET growthcast.storage_subject='11111111-1111-4111-8111-111111111111'" -f /checks/policy.sql >/dev/null 2>&1; then
  echo 'Existing-policy overwrite was accepted'; exit 1
fi
echo 'Storage RLS isolation, no-overwrite and repeat-application refusal passed.'
docker exec "$container" psql -U postgres -v ON_ERROR_STOP=1 -c "SET growthcast.storage_subject='11111111-1111-4111-8111-111111111111'" -f /checks/backup-policy.check.sql
if docker exec "$container" psql -U postgres -v ON_ERROR_STOP=1 -c "SET growthcast.storage_subject='11111111-1111-4111-8111-111111111111'; SET growthcast.backup_storage_subject='33333333-3333-4333-8333-333333333333'" -f /checks/backup-policy.sql >/dev/null 2>&1; then
  echo 'Reader policy repeated upgrade accepted'; exit 1
fi
echo 'Read-only storage backup boundary and writer regression passed.'
