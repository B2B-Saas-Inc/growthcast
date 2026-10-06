#!/bin/sh
set -eu
spike_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
upstream_dir=${1:?Usage: sh portal/atrium-spike/run.sh /absolute/path/to/atrium-checkout}
[ "$(git -C "$upstream_dir" rev-parse HEAD)" = 1a94a30b9aabe0e2d444c9239c4898d18b0dd5e2 ] || exit 1
git -C "$upstream_dir" diff --exit-code HEAD -- >/dev/null
build_dir=$(mktemp -d)
project="growthcast-atrium-$(date +%s)-$$"
compose() {
  if [ "${PORTAL_PROVIDER:-0}" = 1 ]; then
    docker compose -p "$project" -f "$spike_dir/compose.yaml" -f "$spike_dir/provider.compose.yaml" "$@"
  else
    docker compose -p "$project" -f "$spike_dir/compose.yaml" "$@"
  fi
}
cleanup() {
  result=$?
  if [ "$result" != 0 ]; then compose logs --no-log-prefix --tail 50 check api web edge gateway worker 2>/dev/null || true; fi
  if [ "${PORTAL_BROWSER:-0}" = 1 ]; then
    mkdir -p "$spike_dir/artifacts"
    for screenshot in catalog-desktop.png catalog-mobile.png; do
      compose cp "check:/runtime/$screenshot" "$spike_dir/artifacts/$screenshot" >/dev/null 2>&1 || true
    done
  fi
  compose --profile browser down --volumes >/dev/null 2>&1 || true
  rm -rf "$build_dir"
}
trap cleanup EXIT HUP INT TERM
mkdir "$build_dir/upstream"
git -C "$upstream_dir" archive HEAD | tar -x -C "$build_dir/upstream"
cp "$spike_dir/account-handoff.sql" "$build_dir/"
cp -R "$spike_dir/../foundation" "$build_dir/foundation"
cp "$spike_dir/api-runtime.mjs" "$spike_dir/api-server.mjs" "$build_dir/"
cp "$spike_dir/bootstrap.mjs" "$build_dir/"
cp "$spike_dir/Dockerfile" "$spike_dir/compatibility.check.mjs" "$build_dir/"
cp "$spike_dir/http.check.mjs" "$spike_dir/claims.mjs" "$spike_dir/claims.sql" "$spike_dir/gateway-http.mjs" "$spike_dir/ownership.sql" "$spike_dir/ownership.mjs" "$build_dir/"
cp "$spike_dir/catalog.mjs" "$spike_dir/catalog-page.tsx" "$spike_dir/web-overlay.mjs" "$spike_dir/browser-edge.mjs" "$spike_dir/browser.check.mjs" "$build_dir/"
cp "$spike_dir/database-env.mjs" "$spike_dir/worker-once.mjs" "$spike_dir/proof.mjs" "$spike_dir/provider-bridge.mjs" "$spike_dir/completion.mjs" "$spike_dir/completion.sql" "$spike_dir/lifecycle.sql" "$spike_dir/lifecycle.mjs" "$spike_dir/lifecycle-worker.mjs" "$spike_dir/provider-fixture.mjs" "$build_dir/"
mkdir -p "$build_dir/gateway/src"
cp "$spike_dir/../gateway/package.json" "$spike_dir/../gateway/package-lock.json" "$spike_dir/../gateway/schema.sql" "$build_dir/gateway/"
cp "$spike_dir/../gateway/src/store.mjs" "$spike_dir/../gateway/src/policy.mjs" "$spike_dir/../gateway/src/server.mjs" "$spike_dir/../gateway/src/pin.mjs" "$build_dir/gateway/src/"
docker build --target gateway-http -t growthcast-atrium-gateway "$build_dir"
docker build --target check -t growthcast-atrium-spike "$build_dir"
if [ "${PORTAL_PROVIDER:-0}" = 1 ]; then compose up -d provider; fi
if [ "${PORTAL_BROWSER:-0}" = 1 ]; then
  docker build --target web -t growthcast-atrium-web "$build_dir"
  docker build --target edge -t growthcast-atrium-edge "$build_dir"
  docker build --target browser -t growthcast-atrium-browser "$build_dir"
  compose run --rm prepare
  compose up -d --wait database
  compose run --rm initialize
  compose up -d gateway
  compose up -d api worker check web edge
  compose run --rm browser
  check_id=$(compose ps -aq check)
  check_exit=$(docker wait "$check_id")
  compose logs --no-log-prefix check
  [ "$check_exit" = 0 ] || exit 1
  mkdir -p "$spike_dir/artifacts"
  for screenshot in catalog-desktop.png catalog-mobile.png; do
    compose cp "check:/runtime/$screenshot" "$spike_dir/artifacts/$screenshot"
  done
else
  compose up -d --wait database
  compose run --rm initialize
  compose up -d gateway
  compose up -d api worker
  compose run --rm check
fi
