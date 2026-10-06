#!/bin/sh
set -eu
SIGNING_SOURCE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export SIGNING_SOURCE
project="growthcast-signing-preparation-$$"
compose() { docker compose -p "$project" -f "$SIGNING_SOURCE/../../gateway/compose.yaml" -f "$SIGNING_SOURCE/compose.yaml" "$@"; }
cleanup() { compose down --volumes --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT
trap 'exit 130' HUP INT TERM
docker build -f "$SIGNING_SOURCE/Dockerfile" -t growthcast-guest-delivery "$SIGNING_SOURCE/../.."
compose up -d --wait documenso
compose run --rm seed
compose run --rm test --test /foundation/guest/signing/provider-api.check.mjs /foundation/guest/signing/managed-delivery.check.mjs /foundation/guest/signing/worker.check.mjs /foundation/guest/runtime/signing-secrets.check.mjs
compose run --rm test
