#!/bin/sh
set -eu
[ "$1" = snapshot ]
mkdir -p /snapshot/artifacts
pg_dump -h database -U gc_documenso_migrate -d documenso_test --schema=gc_documenso --strict-names -Fc --no-owner -f /snapshot/documenso.dump
pg_dump -h database -U postgres -d gateway_test -Fc --no-owner --no-acl -f /snapshot/gateway.dump
for name in sequential parallel rejection sdk; do
 cp "/runtime/$name-sealed.pdf" "/runtime/$name-canonical.json" /snapshot/artifacts/
done
cp /runtime/fixtures.json /runtime/verified-artifacts.json /runtime/tls.crt /snapshot/artifacts/
(cd /snapshot && sha256sum documenso.dump gateway.dump artifacts/* > SHA256SUMS && tar -cf bundle.tar documenso.dump gateway.dump artifacts SHA256SUMS)
