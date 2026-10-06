#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export RUNTIME_TEST_ROOT="$root"
gateway=$(CDPATH= cd -- "$root/../../../gateway" && pwd)
project="growthcast-runtime-signing-$(date +%s)-$$"
compose() {
 if [ -n "${PHASE2_CLOSEOUT_INPUT:-}" ]; then
  docker compose -p "$project" -f "$gateway/compose.yaml" -f "$root/signing.compose.yaml" -f "$PHASE2_CLOSEOUT_ROOT/signing-recovered.compose.yaml" "$@"
  return
 fi
 docker compose -p "$project" -f "$gateway/compose.yaml" -f "$root/signing.compose.yaml" "$@"; }
cleanup() { compose --profile test down --volumes --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT
trap 'exit 130' HUP INT TERM
compose build gateway test browser sdk
compose up -d --wait database mail documenso gateway sdk
compose run --rm test
compose run --rm seed
compose run --rm test node test/setup.mjs
if [ "${RUNTIME_SECRET_RECOVERY:-0}" = 1 ]; then
  compose stop documenso gateway sdk
  python3 -B "$root/../../secret-recovery/run.py" documenso "$project"
  compose up -d --no-deps --force-recreate --wait documenso gateway sdk
fi
compose run --rm browser
compose run --rm test node test/setup.mjs verify
compose run --rm seed /usr/local/bin/node /fixture/verify-provider.cjs
compose run --rm test node test/setup.mjs reconcile
compose restart documenso gateway
healthy=false
for attempt in $(seq 1 60); do
  if compose exec -T documenso node -e 'fetch("http://127.0.0.1:3000/api/health").then(r=>r.json()).then(b=>process.exit(b.checks.database.status==="ok"&&b.checks.certificate.status==="ok"?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then healthy=true; break; fi
  sleep 1
done
test "$healthy" = true
compose run --rm browser node test/native-browser.mjs resume
compose run --rm browser node test/native-browser.mjs boundary
compose run --rm test node test/setup.mjs expire-sessions
compose run --rm browser node test/native-browser.mjs expired
compose run --rm test node test/setup.mjs restore-sessions
compose run --rm test node test/setup.mjs revoke
compose run --rm browser node test/native-browser.mjs replay
echo 'Packaged provider signing passed: native/SDK, four sealed PDFs, canonical bindings, provider/gateway restart, route boundary, expiry and revocation.'
