#!/bin/sh
set -eu
umask 077
[ "$(id -u)" != 0 ]
[ -z "$(ls -A /work)" ] && [ -z "$(ls -A /restored)" ] && [ -z "$(ls -A /objects)" ] || { echo 'Fresh restore directories required' >&2; exit 1; }
export PGHOST=/work/socket PGDATA=/work/database TMPDIR=/work
mkdir "$PGHOST"
cleanup() {
 pg_ctl -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true
 find /work /restored /objects -mindepth 1 -maxdepth 1 -exec rm -rf {} \;
}
trap cleanup EXIT
initdb -D "$PGDATA" --auth-local=trust --auth-host=reject >/work/init.log 2>&1
pg_ctl -D "$PGDATA" -l /work/postgres.log -o "-k /work/socket -c listen_addresses=''" -w start >/dev/null
cp /input/bundle.tar /restored/bundle.tar
sh /app/deployment/managed-recovery/restore.sh >/work/restore.log 2>&1
node /app/deployment/managed-recovery/verify.mjs >/work/verification.log 2>&1
if sh /app/deployment/managed-recovery/restore.sh >/work/repeat.log 2>&1; then
 echo 'Occupied target was accepted' >&2; exit 1
fi
grep -q 'Restore target is not empty' /work/repeat.log
node /app/deployment/managed-recovery/verify.mjs >/work/reverified.log 2>&1
cat /work/reverified.log
printf '%s\n' 'Packaged isolated restore passed; target overwrite denied.'
