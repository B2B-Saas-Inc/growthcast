#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
upstream=${1:?Usage: sh portal/foundation/run.sh /path/to/pinned-atrium-checkout}
[ "$(git -C "$upstream" rev-parse HEAD)" = 1a94a30b9aabe0e2d444c9239c4898d18b0dd5e2 ]
git -C "$upstream" diff --exit-code HEAD -- >/dev/null
context=$(mktemp -d)
project="growthcast-foundation-$(date +%s)-$$"
compose() { docker compose -p "$project" -f "$root/compose.yaml" "$@"; }
cleanup() {
  result=$?
  if [ "$result" != 0 ]; then compose logs --tail 30 database restore 2>/dev/null || true; fi
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$context"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM
mkdir "$context/upstream" "$context/gateway"
git -C "$upstream" archive HEAD | tar -x -C "$context/upstream"
mkdir "$context/adapters"
cp "$root/../atrium-spike/claims.mjs" "$root/../atrium-spike/catalog.mjs" "$context/adapters/"
cp -R "$root" "$context/foundation"
cp "$root/Dockerfile" "$context/Dockerfile"
cp -R "$root/../gateway/src" "$context/gateway/"
cp "$root/../gateway/package.json" "$root/../gateway/package-lock.json" "$context/gateway/"
docker build --target foundation -t growthcast-foundation "$context"
docker build --target application -t growthcast-foundation-application "$context"
docker run --rm --network none growthcast-foundation node --test foundation.check.mjs
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
# The restore command must refuse to overwrite an already-restored database.
if compose run --rm backup; then echo 'Restore overwrite guard failed' >&2; exit 1; fi
compose run --rm recovery-check node check.mjs verify
printf '%s\n' 'Phase 2 local foundation passed: pinned baseline, explicit migrations, runtime guard, TLS, persistence and isolated restore.'
