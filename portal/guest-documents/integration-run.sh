#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
fixture="$root/../deployment/runtime/test"
export GUEST_WORKFLOW_ROOT="$root"
project="growthcast-guest-connectors-$$"
local_input=$(mktemp -d)
export GUEST_CONNECTOR_INPUT=${GUEST_CONNECTOR_INPUT:-$local_input}
export GUEST_EVIDENCE_FILE=$(mktemp)
chmod 666 "$GUEST_EVIDENCE_FILE"
compose() { docker compose -p "$project" -f "$fixture/compose.yaml" -f "$fixture/atrium.compose.yaml" -f "$root/integration.compose.yaml" "$@"; }
cleanup() { compose --profile test down --volumes --remove-orphans >/dev/null 2>&1 || true; rm -f "$GUEST_EVIDENCE_FILE"; rmdir "$local_input"; }
trap cleanup EXIT
trap 'exit 130' HUP INT TERM
compose up -d --wait provider
compose run --rm --no-deps auth-check
compose run --rm --no-deps connector-check
if [ -f "$GUEST_CONNECTOR_INPUT/storage.json" ]; then target=storage-integration-evidence.json; else target=auth-integration-evidence.json; fi
cp "$GUEST_EVIDENCE_FILE" "$root/$target"
chmod 644 "$root/$target"
