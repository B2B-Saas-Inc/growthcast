#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
cd "$root"
python3 portal/deployment/phase-2-closeout/source-check.py portal
mkdir -p portal/checkouts
if [ ! -d portal/checkouts/atrium/.git ]; then
 git init portal/checkouts/atrium
 git -C portal/checkouts/atrium remote add upstream https://github.com/Vibra-Labs/Atrium.git
 git -C portal/checkouts/atrium fetch --depth=1 upstream 1a94a30b9aabe0e2d444c9239c4898d18b0dd5e2
 git -C portal/checkouts/atrium checkout --detach FETCH_HEAD
fi
sh portal/foundation/run.sh "$PWD/portal/checkouts/atrium"
sh portal/deployment/runtime/build-atrium.sh "$PWD/portal/checkouts/atrium"
docker run --rm --network none --entrypoint /usr/local/bin/bun -v "$PWD/portal/deployment/production/webhook-runtime.check.mjs:/webhook.check.mjs:ro" growthcast-atrium-runtime /webhook.check.mjs
docker run --rm --network none -v "$PWD/portal:/portal:ro" node:22-alpine node --test /portal/deployment/production/proxy-webhook.check.mjs
sh portal/deployment/supabase/managed-atrium/run.sh
sh portal/deployment/check.sh

# Phase 3 candidate stays outside the deployed migration manifest.
docker run --rm --network none --read-only --cap-drop ALL -v "$PWD/portal/guest-documents:/guest:ro" node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf node --test /guest/runtime/boundary.check.mjs
sh portal/guest-documents/run.sh
sh portal/guest-documents/signing/run.sh
sh portal/guest-documents/signing/delivery-run.sh
docker build -f portal/guest-documents/runtime/Dockerfile -t growthcast-guest-runtime portal
docker run --rm --network none --read-only --cap-drop ALL --tmpfs /tmp:rw,nosuid,nodev,size=16m --tmpfs /run:rw,nosuid,nodev,mode=1777,size=1m --entrypoint node growthcast-guest-runtime --test /app/guest-documents/runtime/config.check.mjs /app/guest-documents/runtime/boundary.check.mjs
sh portal/guest-documents/runtime/run.sh

# Real packaged Better Auth with synthetic local SMTP; no cloud credentials.
sh portal/guest-documents/integration-run.sh

# Upload-only documents and reusable private Library.
sh portal/deployment/file-library/run.sh

# Candidate staff UI through actual HTTPS, login, CSRF and database writes.
docker build -f portal/deployment/web-app/Dockerfile.browser -t growthcast-portal-browser portal/deployment/web-app
sh portal/guest-documents/web/build.sh
sh portal/guest-documents/web/run.sh
