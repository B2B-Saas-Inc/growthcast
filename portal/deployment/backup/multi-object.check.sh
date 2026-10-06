#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export PORTAL_STAGING_SECRETS=${PORTAL_STAGING_SECRETS:-"$HOME/.config/growthcast/portal-staging"}
journal="growthcast-multi-object-check-$(date +%s)-$$"
docker volume create "$journal" >/dev/null
fixture() { docker run --rm -v "$root/..:/app/deployment:ro" -v "$PORTAL_STAGING_SECRETS/storage-credentials.json:/writer/credentials.json:ro" -v "$journal:/journal" growthcast-managed-recovery /app/deployment/backup/object-fixture.mjs "$1"; }
cleanup() {
 result=$?
 if ! fixture cleanup; then echo "Fixture cleanup failed; preserved journal $journal" >&2; exit 1; fi
 docker volume rm "$journal" >/dev/null
 exit "$result"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM
fixture prepare
sh "$root/recovery-check.sh"
