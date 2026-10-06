#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export PORTAL_STAGING_SECRETS=${PORTAL_STAGING_SECRETS:-"$HOME/.config/growthcast/portal-staging"}
project="growthcast-managed-recovery-$(date +%s)-$$"
compose() {
 if [ "${PORTAL_BACKUP_DATABASE:-0}" = 1 ]; then
  docker compose -p "$project" -f "$root/compose.yaml" -f "$root/backup.compose.yaml" "$@"
 else docker compose -p "$project" -f "$root/compose.yaml" "$@"; fi
}
cleanup() {
 result=$?
 if ! compose run --rm --no-deps cleanup-source; then
   echo "Source cleanup failed; preserved journal for $project" >&2
   exit 1
 fi
 compose down --volumes --remove-orphans >/dev/null 2>&1 || true
 exit "$result"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM
compose run --rm prepare
compose run --rm prepare-source
compose run --rm capture
compose run --rm encrypt
python3 "$root/../offhost/roundtrip.py" "$project" --scope managed-supabase --receipt "${PORTAL_OFFHOST_RECEIPT:?Receipt path required}"
compose run --rm decrypt
compose up -d --wait target
compose run --rm restore
compose run --rm verify
if compose run --rm restore; then echo 'Overwrite guard failed' >&2; exit 1; fi
compose run --rm verify
echo 'Managed Supabase private-schema and object off-host recovery passed.'
