#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
docker run --rm --network none --user postgres --entrypoint sh \
 -v "$root:/backup:ro" -v "$root/../supabase/isolation.sql:/isolation.sql:ro" \
 postgres:17-alpine@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73 \
 -ec 'initdb -D /tmp/testdb -A trust >/dev/null; pg_ctl -D /tmp/testdb -o "-k /tmp -c listen_addresses=" -w start >/dev/null; psql -h /tmp -v ON_ERROR_STOP=1 -f /backup/check.sql; pg_ctl -D /tmp/testdb -m fast -w stop >/dev/null'
echo 'Backup grants, future-table reads, filtered storage view, write/sequence/escalation and API denials passed.'
