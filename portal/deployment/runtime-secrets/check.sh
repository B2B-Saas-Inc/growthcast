#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
docker build --target dependencies -f "$root/../backup/job/Dockerfile" -t growthcast-runtime-secret-check "$root/../.."
for uid in 1000 1001; do
  docker run --rm --network none --user "$uid:$uid" --read-only --tmpfs /tmp \
    -v "$root/..:/app/deployment:ro" growthcast-runtime-secret-check \
    node --test /app/deployment/runtime-secrets/deliver.check.mjs
done
