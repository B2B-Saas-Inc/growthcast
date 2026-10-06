#!/bin/sh
# Explicit manual all-object capture and isolated restore; never modifies the source.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export PORTAL_STAGING_SECRETS=${PORTAL_STAGING_SECRETS:-"$HOME/.config/growthcast/portal-staging"}
project="growthcast-managed-recovery-$(date +%s)-$$"
compose() { docker compose -p "$project" -f "$root/../managed-recovery/compose.yaml" -f "$root/capture.compose.yaml" "$@"; }
cleanup() { result=$?; compose down --volumes --remove-orphans >/dev/null 2>&1 || true; exit "$result"; }
trap cleanup EXIT
trap 'exit 130' HUP INT TERM
compose run --rm prepare
compose run --rm capture
compose run --rm encrypt
python3 "$root/../offhost/roundtrip.py" "$project" --scope managed-supabase --receipt "${PORTAL_OFFHOST_RECEIPT:?Receipt path required}"
compose run --rm decrypt
compose up -d --wait target
compose run --rm restore
compose run --rm verify
if compose run --rm restore; then echo 'Overwrite guard failed' >&2; exit 1; fi
compose run --rm verify
echo 'Read-only all-object source capture and independent encrypted restore passed.'
