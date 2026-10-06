#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
export MANAGED_ATRIUM_ROOT="$root/deployment/supabase/managed-atrium"
project="gc-guest-runtime-$$"
compose() { docker compose -p "$project" -f "$root/foundation/compose.yaml" -f "$MANAGED_ATRIUM_ROOT/compose.yaml" -f "$root/guest-documents/runtime/compose.yaml" "$@"; }
cleanup() { compose down --volumes --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT
trap 'exit 130' HUP INT TERM
compose up -d --wait database restore
compose run --rm provision
compose run --rm runtime-backup node /backup/check.mjs provision
compose run --rm migration
compose run --rm runtime-migrate
compose run --rm runtime-guard
compose run --rm gateway-guard
compose run --rm lifecycle-guard
compose run --rm runtime-backup
