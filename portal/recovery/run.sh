#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project=${1:?Existing disposable gateway Compose project required}
case "$project" in growthcast-gateway-*) ;; *) exit 1;; esac
compose() { docker compose -p "$project" -f "$root/../gateway/compose.yaml" -f "$root/compose.yaml" "$@"; }
# No live writers while databases and external evidence are snapshotted.
compose build recovery-prepare
compose up -d --wait recovery-db
compose run --rm recovery-prepare
compose stop documenso gateway sdk
resume() { compose start documenso gateway sdk >/dev/null; }
trap resume EXIT
trap 'exit 130' HUP INT TERM
started=$(date +%s)
compose run --rm recovery-snapshot
compose run --rm recovery-encrypt
compose run --rm recovery-decrypt
compose run --rm recovery-restore
compose run --rm recovery-verify
if compose run --rm recovery-restore; then echo 'Restore overwrite guard failed' >&2; exit 1; fi
compose run --rm recovery-verify
elapsed=$(( $(date +%s) - started ))
printf 'Encrypted real-provider recovery verified in %s seconds (local fixture; not a production RTO).\n' "$elapsed"
