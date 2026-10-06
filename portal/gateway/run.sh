#!/bin/sh
set -eu
gateway_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project="growthcast-gateway-$(date +%s)-$$"
compose() { docker compose -p "$project" -f "$gateway_dir/compose.yaml" "$@"; }
cleanup() { docker compose -p "$project" -f "$gateway_dir/compose.yaml" -f "$gateway_dir/../recovery/compose.yaml" down --volumes --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT
trap 'exit 130' HUP INT TERM
compose build gateway test browser sdk
compose up -d --wait database mail documenso gateway sdk
compose run --rm test
compose run --rm seed
compose run --rm test node test/setup.mjs
compose run --rm browser
compose run --rm test node test/setup.mjs verify
compose run --rm --entrypoint node seed /fixture/verify-provider.cjs
compose run --rm test node test/setup.mjs reconcile
sh "$gateway_dir/../recovery/run.sh" "$project"
if [ -n "${PORTAL_ATRIUM_CHECKOUT:-}" ]; then
  PORTAL_PROVIDER=1 PORTAL_BROWSER=1 PORTAL_PROVIDER_NETWORK="${project}_private" PORTAL_PROVIDER_VOLUME="${project}_runtime" \
    sh "$gateway_dir/../atrium-spike/run.sh" "$PORTAL_ATRIUM_CHECKOUT"
fi
compose restart gateway
compose run --rm browser node test/native-browser.mjs resume
compose run --rm browser node test/native-browser.mjs boundary
compose run --rm test node test/setup.mjs expire-sessions
compose run --rm browser node test/native-browser.mjs expired
compose run --rm test node test/setup.mjs restore-sessions
compose run --rm browser node test/native-browser.mjs resume
compose run --rm test node test/setup.mjs revoke
compose run --rm browser node test/native-browser.mjs replay
mkdir -p "$gateway_dir/artifacts"
# Copy only explicitly named synthetic evidence, never credentials/session state.
for name in sdk-0-ready.png sdk-1-ready.png sdk-0.png sdk-1.png desktop-pin.png mobile-pin.png desktop-client.png mobile-countersigner.png parallel-0.png parallel-1.png route-inventory.json; do
  compose cp "gateway:/runtime/$name" "$gateway_dir/artifacts/$name"
done
echo 'Gateway spike passed: native signing, countersigning, PDF verification, restart and revocation.'
