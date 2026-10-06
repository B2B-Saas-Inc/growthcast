#!/bin/sh
set -eu
# Ephemeral self-signed test material, kept in a Docker volume outside Git.
openssl req -x509 -newkey rsa:2048 -nodes -keyout /runtime/tls.key \
  -out /runtime/tls.crt -days 2 -subj '/CN=signing.growthcast.test' \
  -addext 'subjectAltName=DNS:signing.growthcast.test' >/dev/null 2>&1
openssl pkcs12 -export -out /runtime/test-cert.p12 -inkey /runtime/tls.key \
  -in /runtime/tls.crt -passout pass: >/dev/null 2>&1
# Test certificates are accessible to the unprivileged application containers.
chmod 644 /runtime/tls.key /runtime/tls.crt /runtime/test-cert.p12
node /fixture/prepare-assets.cjs
