#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
deployment="$root/../../deployment"
export GUEST_WORKFLOW_ROOT="$root/.."
export LIBRARY_ROOT="$deployment/file-library"
export LIBRARY_BROWSER_OUTPUT=$(mktemp -d)
project="growthcast-guest-ui-$$"
compose() { docker compose -p "$project" -f "$deployment/runtime/test/compose.yaml" -f "$deployment/runtime/test/atrium.compose.yaml" -f "$LIBRARY_ROOT/browser.compose.yaml" -f "$root/browser.compose.yaml" "$@"; }
cleanup() { compose logs --no-color --tail 20 guest web ingress > "$LIBRARY_BROWSER_OUTPUT/runtime.log" 2>&1 || true; compose --profile test down --volumes --remove-orphans >/dev/null 2>&1 || true; echo "Local browser evidence: $LIBRARY_BROWSER_OUTPUT"; }
trap cleanup EXIT
trap 'exit 130' HUP INT TERM
docker build -f "$root/../signing/Dockerfile" -t growthcast-guest-delivery "$root/../.."
compose up -d --wait provider
compose run --rm --no-deps auth-check
compose run --rm --no-deps guest-seed seed
compose up -d --no-deps --wait guest web ingress browser
python3 -B "$root/browser.py" "$project"
cp "$LIBRARY_BROWSER_OUTPUT/guest-ui-evidence.json" "$root/browser-evidence.json"
