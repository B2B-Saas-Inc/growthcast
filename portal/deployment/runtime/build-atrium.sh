#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
upstream=${1:?Usage: sh build-atrium.sh /path/to/pinned-atrium-checkout}
test "$(git -C "$upstream" rev-parse HEAD)" = 1a94a30b9aabe0e2d444c9239c4898d18b0dd5e2
git -C "$upstream" diff --exit-code HEAD -- >/dev/null
context=$(mktemp -d)
trap 'rm -rf "$context"' EXIT
trap 'exit 130' HUP INT TERM
mkdir -p "$context/upstream" "$context/gateway" "$context/deployment/runtime" "$context/deployment/supabase"
# Only tracked pinned source is admitted; local .env and checkout artifacts are excluded.
git -C "$upstream" archive HEAD | tar -x -C "$context/upstream"
cp "$root/../backup/job/package.json" "$root/../backup/job/package-lock.json" "$context/gateway/"
cp "$root/config.mjs" "$root/start.mjs" "$root/secret-files.mjs" "$context/deployment/runtime/"
mkdir "$context/deployment/runtime-connections"
cp "$root/../runtime-connections/deliver.mjs" "$root/../runtime-connections/pins.json" "$context/deployment/runtime-connections/"
mkdir "$context/deployment/runtime-secrets"
cp "$root/../runtime-secrets/deliver.mjs" "$root/../runtime-secrets/material.mjs" "$root/../runtime-secrets/runtime-pins.json" "$context/deployment/runtime-secrets/"
cp "$root/../supabase-config.mjs" "$context/deployment/"
for service in managed-atrium managed-documenso; do
  mkdir "$context/deployment/supabase/$service"
  cp "$root/../supabase/$service/migrate.mjs" "$context/deployment/supabase/$service/"
  cp -R "$root/../supabase/$service/migrations" "$context/deployment/supabase/$service/"
done
cp "$root/../supabase/managed-documenso/fingerprint.mjs" "$root/../supabase/managed-documenso/manifest.json" "$context/deployment/supabase/managed-documenso/"
cp "$root/Dockerfile.atrium" "$context/Dockerfile"
cp -R "$root/atrium-patches" "$context/atrium-patches"
cp "$root/../api-origin.mjs" "$context/atrium-patches/"
mkdir "$context/deployment/storage"
cp "$root/../storage/client.mjs" "$context/deployment/storage/"
docker build -t growthcast-atrium-runtime "$context"
