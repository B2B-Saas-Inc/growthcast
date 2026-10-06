#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
docker build -f "$root/../managed-recovery/Dockerfile" -t growthcast-managed-recovery "$root/../.." >/dev/null
network="growthcast-catalog-check-$$"
container="$network-db"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; docker network rm "$network" >/dev/null 2>&1 || true; }
trap cleanup EXIT HUP INT TERM
docker network create --internal "$network" >/dev/null
docker run -d --name "$container" --network "$network" --network-alias database -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73 >/dev/null
for attempt in 1 2 3 4 5 6 7 8 9 10; do
 if docker logs "$container" 2>&1 | grep -q 'PostgreSQL init process complete' && docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
 sleep 1
done
docker run --rm --network "$network" -v "$root/..:/app/deployment:ro" growthcast-managed-recovery /app/deployment/backup/catalog.check.mjs
