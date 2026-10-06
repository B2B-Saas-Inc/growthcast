#!/bin/sh
set -eu
# Refuse existing application schemas before creating or restoring any database.
count=$(psql -h recovery-db -U postgres -d postgres -Atc "SELECT count(*) FROM pg_database WHERE datname IN ('documenso_test','gateway_test')")
[ "$count" = 0 ] || { echo 'Restore target is not empty' >&2; exit 1; }
tar -C /restored -xf /restored/bundle.tar
(cd /restored && sha256sum -c SHA256SUMS)
createdb -h recovery-db -U postgres documenso_test
createdb -h recovery-db -U postgres gateway_test
pg_restore -h recovery-db -U postgres -d documenso_test --no-owner --no-acl --exit-on-error --single-transaction /restored/documenso.dump
pg_restore -h recovery-db -U postgres -d gateway_test --no-owner --no-acl --exit-on-error --single-transaction /restored/gateway.dump
