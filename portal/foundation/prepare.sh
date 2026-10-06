#!/bin/sh
set -eu
if [ -s /ca/server.crt ] && [ -s /tls/server.key ] && [ -s /secrets/postgres/password ] && [ -s /secrets/gc_migrate/password ] && [ -s /secrets/gc_app/password ] && [ -s /secrets/gc_lifecycle/password ] && [ -s /secrets/gc_gateway/password ]; then exit 0; fi
if [ -e /ca/server.crt ] || [ -e /secrets/postgres/password ]; then echo 'Partial bootstrap state; refusing credential rotation' >&2; exit 1; fi
openssl req -x509 -newkey rsa:2048 -nodes -keyout /tls/server.key -out /ca/server.crt -days 2 -subj /CN=database -addext 'subjectAltName=DNS:database,DNS:restore' >/dev/null 2>&1
cp /ca/server.crt /tls/server.crt
chown 70:70 /tls/server.key
chmod 600 /tls/server.key
chmod 644 /tls/server.crt /ca/server.crt
node -e 'const fs=require("node:fs"),crypto=require("node:crypto");for(const role of ["postgres","gc_migrate","gc_app","gc_lifecycle","gc_gateway"])fs.writeFileSync("/secrets/"+role+"/password",crypto.randomBytes(32).toString("hex"),{mode:0o444});for(const path of ["/artifacts","/restored-artifacts","/backups"])fs.chmodSync(path,0o777);'
