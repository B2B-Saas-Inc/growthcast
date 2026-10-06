#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
fixture="$root/../runtime/test"
export LIBRARY_ROOT="$root"
project="growthcast-file-library-$$"
export LIBRARY_EVIDENCE_FILE=$(mktemp)
chmod 666 "$LIBRARY_EVIDENCE_FILE"
extra=""
if [ "${LIBRARY_BROWSER:-0}" = 1 ]; then extra="-f $root/browser.compose.yaml"; export LIBRARY_BROWSER_OUTPUT=$(mktemp -d); fi
compose() { docker compose -p "$project" -f "$fixture/compose.yaml" -f "$fixture/atrium.compose.yaml" -f "$root/integration.compose.yaml" $extra "$@"; }
cleanup() { if [ "${LIBRARY_BROWSER:-0}" = 1 ]; then compose logs --no-color --tail 30 web ingress > "$LIBRARY_BROWSER_OUTPUT/runtime.log" 2>&1 || true; echo "Local browser evidence: $LIBRARY_BROWSER_OUTPUT"; fi; compose --profile test down --volumes --remove-orphans >/dev/null 2>&1 || true; rm -f "$LIBRARY_EVIDENCE_FILE"; }
trap cleanup EXIT
trap 'exit 130' HUP INT TERM
compose up -d --wait provider
compose run --rm --no-deps migration-check
compose run --rm --no-deps auth-check
compose run --rm --no-deps library-check
cp "$LIBRARY_EVIDENCE_FILE" "$root/api-evidence.json"
chmod 644 "$root/api-evidence.json"

if [ "${LIBRARY_BROWSER:-0}" = 1 ]; then
 compose up -d --no-deps --wait web ingress browser
 python3 -B "$root/browser.py" "$project"
 cp "$LIBRARY_BROWSER_OUTPUT/browser-evidence.json" "$root/browser-evidence.json"
 echo "Browser screenshots: $LIBRARY_BROWSER_OUTPUT"
fi
