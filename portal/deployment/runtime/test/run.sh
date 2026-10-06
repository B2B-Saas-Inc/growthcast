#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project="growthcast-runtime-$(date +%s)-$$"
service=${RUNTIME_TEST_SERVICE:-documenso}
case "$service" in
  documenso) engine=node; port=3000 ;;
  atrium) engine=bun; port=3001 ;;
  *) echo 'Unsupported runtime fixture'; exit 1 ;;
esac
managed_storage=${RUNTIME_MANAGED_STORAGE:-0}
if [ "$managed_storage" = 1 ]; then
  test "$service" = atrium
  test -f "${PORTAL_STORAGE_CREDENTIAL_FILE:?Scoped storage credential path required}"
fi
compose() {
  if [ -n "${PHASE2_CLOSEOUT_INPUT:-}" ]; then
    test "$service" = atrium
    docker compose -p "$project" -f "$root/compose.yaml" -f "$root/atrium.compose.yaml" -f "$PHASE2_CLOSEOUT_ROOT/atrium-recovered.compose.yaml" "$@"
    return
  fi
  if [ "$managed_storage" = 1 ]; then
    docker compose -p "$project" -f "$root/compose.yaml" -f "$root/atrium.compose.yaml" -f "$root/managed-storage.compose.yaml" "$@"
    return
  fi
  if [ "$service" = atrium ]; then
    docker compose -p "$project" -f "$root/compose.yaml" -f "$root/atrium.compose.yaml" "$@"
  else
    docker compose -p "$project" -f "$root/compose.yaml" "$@"
  fi
}
cleanup() {
  result=$?
  if [ "$managed_storage" = 1 ]; then
    compose stop provider >/dev/null 2>&1 || true
    if ! compose run --rm --no-deps storage-cleanup; then
      echo "Managed artifact cleanup failed; retained fixture volumes for recovery: $project" >&2
      exit 1
    fi
  fi
  docker rm -f "$project-refusal" >/dev/null 2>&1 || true; compose --profile test down --volumes --remove-orphans >/dev/null 2>&1 || true; exit "$result"; }
trap cleanup EXIT
trap 'exit 130' HUP INT TERM
if [ "$service" = atrium ]; then
  docker run --rm --network none --entrypoint /usr/local/bin/bun \
    -v "$root/capture-policy.check.cjs:/fixture/capture-policy.check.cjs:ro" \
    growthcast-atrium-runtime /fixture/capture-policy.check.cjs
  docker run --rm --network none --read-only --tmpfs /tmp --entrypoint /usr/local/bin/bun \
    -v "$root/storage-path.check.cjs:/fixture/storage-path.check.cjs:ro" \
    growthcast-atrium-runtime /fixture/storage-path.check.cjs
fi
compose up -d --wait provider
compose exec -T provider "$engine" -e 'const fs=require("fs");if(process.getuid()===0||fs.existsSync("/admin/password")||fs.existsSync("/tls/server.key"))process.exit(1);'
if [ "$service" = atrium ]; then compose run --rm --no-deps http-check; fi
if [ "$service" = atrium ]; then compose run --rm --no-deps auth-check; fi
if [ "$service" = atrium ]; then
  compose run --rm --no-deps setup enroll
  compose run --rm --no-deps storage-check
  if [ "${RUNTIME_SECRET_RECOVERY:-0}" = 1 ]; then
    compose stop provider
    python3 -B "$root/../../secret-recovery/run.py" atrium "$project"
  fi
  compose up -d --no-deps --force-recreate --wait provider
else compose restart provider; fi
healthy=false
for attempt in $(seq 1 60); do
  if compose exec -T provider "$engine" -e "fetch('http://127.0.0.1:$port/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then healthy=true; break; fi
  sleep 1
done
test "$healthy" = true
if [ "$service" = atrium ]; then compose run --rm --no-deps auth-check node /fixture/atrium-auth.check.mjs resume; fi
if [ "$service" = atrium ]; then compose run --rm --no-deps storage-check node /fixture/atrium-storage.check.mjs resume; fi
compose stop provider
compose run --rm --no-deps setup drift
# Actual guarded application entrypoint must exit before starting the provider.
compose run -d --no-deps --name "$project-refusal" provider >/dev/null
stopped=false
for attempt in $(seq 1 30); do
  if [ "$(docker inspect --format '{{.State.Status}}' "$project-refusal")" = exited ]; then stopped=true; break; fi
  sleep 1
done
test "$stopped" = true
test "$(docker inspect --format '{{.State.ExitCode}}' "$project-refusal")" = 1
docker rm "$project-refusal" >/dev/null
compose run --rm --no-deps setup repair
compose up -d --no-deps --wait provider
if [ "$service" = atrium ]; then compose run --rm --no-deps http-check; fi
if [ "$service" = atrium ]; then
  compose run --rm --no-deps storage-check node /fixture/atrium-storage.check.mjs resume
  compose run --rm --no-deps setup unenroll
  compose run --rm --no-deps storage-check node /fixture/atrium-storage.check.mjs denied
fi
if [ "$service" = atrium ]; then compose run --rm --no-deps auth-check node /fixture/atrium-auth.check.mjs logout; fi
echo "Packaged $service passed verified TLS/SCRAM startup, restricted mounts, health, restart, drift refusal and repaired restart."
