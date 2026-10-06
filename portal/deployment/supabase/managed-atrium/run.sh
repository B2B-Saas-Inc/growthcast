#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
foundation=$(CDPATH= cd -- "$root/../../../foundation" && pwd)
export MANAGED_ATRIUM_ROOT="$root"
project="growthcast-managed-atrium-$$"
compose() { docker compose -p "$project" -f "$foundation/compose.yaml" -f "$root/compose.yaml" "$@"; }
cleanup() { result=$?; if [ "$result" != 0 ]; then compose logs --tail 20 database 2>/dev/null || true; fi; compose down --volumes --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT
trap 'exit 130' HUP INT TERM
# Build source-pinned images using the original foundation runner first if absent.
docker image inspect growthcast-foundation growthcast-foundation-application >/dev/null
docker run --rm --network none -v "$root/../../..:/portal:ro" -w /portal/deployment/supabase/managed-atrium node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf node --test provenance.check.mjs
compose up -d --wait database restore
compose run --rm provision
compose run --rm runtime node check.mjs pre-migration
compose run --rm migration
compose run --rm runtime node check.mjs seed
compose run --rm runtime node check.mjs transport
compose run --rm migration node check.mjs seed-provider
compose run --rm application
compose restart database
compose up -d --wait database
compose run --rm runtime node check.mjs verify
compose run --rm migration node check.mjs drift
compose run --rm backup
compose run --rm recovery-check node check.mjs verify
if compose run --rm backup; then echo 'Restore overwrite guard failed' >&2; exit 1; fi
compose run --rm recovery-check node check.mjs verify
printf '%s\n' 'Managed Atrium baseline passed: private-schema AppModule, migration idempotence/drift, TLS, restart and isolated restore.'
