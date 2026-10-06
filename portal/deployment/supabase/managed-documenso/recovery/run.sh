#!/bin/sh
set -eu
managed_recovery=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
root=$(CDPATH= cd -- "$managed_recovery/../../../../recovery" && pwd)
export MANAGED_DOCUMENSO_ROOT=$(CDPATH= cd -- "$managed_recovery/.." && pwd)
project=${1:?Existing disposable gateway Compose project required}
case "$project" in growthcast-gateway-*) ;; *) exit 1;; esac
compose() { docker compose -p "$project" -f "$root/../gateway/compose.yaml" -f "$root/compose.yaml" -f "$MANAGED_DOCUMENSO_ROOT/compose.yaml" -f "$managed_recovery/compose.yaml" "$@"; }
# No live writers while databases and external evidence are snapshotted.
compose build recovery-prepare
compose up -d --wait recovery-db
compose run --rm recovery-prepare
compose stop documenso gateway sdk
resume() {
 for service in documenso gateway sdk; do docker start "$(compose ps -aq "$service")" >/dev/null; done
 provider=$(compose ps -aq documenso)
 attempt=0
 while [ "$attempt" -lt 60 ]; do
  if [ "$(docker inspect --format '{{.State.Health.Status}}' "$provider")" = healthy ]; then return 0; fi
  attempt=$((attempt+1))
  sleep 1
 done
 echo 'Provider did not become healthy after recovery pause' >&2
 return 1
}
trap resume EXIT
trap 'exit 130' HUP INT TERM
started=$(date +%s)
compose run --rm recovery-snapshot
compose run --rm recovery-encrypt
if [ "${PORTAL_OFFHOST_RECOVERY:-0}" = 1 ]; then
  python3 "$managed_recovery/../../../offhost/roundtrip.py" "$project" --receipt "${PORTAL_OFFHOST_RECEIPT:?Receipt path required}"
fi
compose run --rm recovery-decrypt
compose run --rm recovery-restore
compose run --rm recovery-verify
if compose run --rm recovery-restore; then echo 'Restore overwrite guard failed' >&2; exit 1; fi
compose run --rm recovery-verify
elapsed=$(( $(date +%s) - started ))
resume
trap - EXIT
printf 'Encrypted real-provider recovery verified in %s seconds (local fixture; not a production RTO).\n' "$elapsed"
