#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export MANAGED_ATRIUM_ROOT="$root/../deployment/supabase/managed-atrium"
project="growthcast-guest-workflow-$$"
# Compose resolves all relative paths against the first file; use explicit guest mounts.
export GUEST_WORKFLOW_ROOT="$root"
compose() { docker compose -p "$project" -f "$root/../foundation/compose.yaml" -f "$MANAGED_ATRIUM_ROOT/compose.yaml" -f "$root/compose.yaml" "$@"; }
export GUEST_EVIDENCE_FILE=$(mktemp)
chmod 666 "$GUEST_EVIDENCE_FILE"
cleanup() { compose down --volumes --remove-orphans >/dev/null 2>&1 || true; rm -f "$GUEST_EVIDENCE_FILE"; }
trap cleanup EXIT
trap 'exit 130' HUP INT TERM
docker image inspect growthcast-foundation >/dev/null
compose up -d --wait database restore
compose run --rm provision
compose run --rm migration
compose run --rm guest-migrate
compose run --rm guest-check
result="$root/evidence.json"
cp "$GUEST_EVIDENCE_FILE" "$result"
chmod 644 "$result"
