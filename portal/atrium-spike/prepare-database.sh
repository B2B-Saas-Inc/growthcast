#!/bin/sh
set -eu
if [ -s /db-tls/server.key ] && [ -s /ca/server.crt ]; then exit 0; fi
if [ -e /db-tls/server.key ] || [ -e /ca/server.crt ]; then echo 'Partial TLS bootstrap state' >&2; exit 1; fi
openssl req -x509 -newkey rsa:2048 -nodes -keyout /db-tls/server.key -out /ca/server.crt -days 2 -subj /CN=database -addext 'subjectAltName=DNS:database' >/dev/null 2>&1
cp /ca/server.crt /db-tls/server.crt
chown 70:70 /db-tls/server.key
chmod 600 /db-tls/server.key
chmod 644 /db-tls/server.crt /ca/server.crt
