#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
docker build -f "$root/Dockerfile.validate" -t growthcast-infra-validator "$root"
docker run --rm -v "$root:/config:ro" growthcast-infra-validator superseded/aws-foundation-rds.json
docker run --rm -v "$root:/config:ro" growthcast-infra-validator offhost/foundation.json
docker run --rm -v "$root:/config:ro" growthcast-infra-validator runtime-secrets/foundation.json
docker run --rm -v "$root:/config:ro" growthcast-infra-validator runtime-connections/foundation.json
docker run --rm -v "$root:/config:ro" growthcast-infra-validator phase-2-closeout/foundation.json
# This regional staging stack intentionally pins its two reviewed availability zones.
docker run --rm -v "$root:/config:ro" growthcast-infra-validator https-ingress/foundation.json --ignore-checks W3010
docker run --rm -v "$root:/config:ro" growthcast-infra-validator backup/job/foundation.json
docker run --rm -v "$root:/config:ro" growthcast-infra-validator backup/restore-worker/foundation.json
docker run --rm -v "$root:/config:ro" growthcast-infra-validator backup/orchestration/foundation.json
docker run --rm -v "$root:/config:ro" -w /config node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf node --test deployment.check.mjs supabase.check.mjs runtime/runtime.check.mjs runtime/secret-files.check.mjs proxy-secret/runtime.check.mjs runtime-secrets/material.check.mjs storage/client.check.mjs backup/capture.check.mjs backup/job/core.check.mjs backup/verification/records.check.mjs backup/restore-worker/cloud-core.check.mjs backup/orchestration/workflow.check.mjs
sh "$root/supabase/check.sh"
sh "$root/storage/check.sh"
sh "$root/backup/check.sh"
sh "$root/backup/snapshot.check.sh"
sh "$root/backup/catalog.check.sh"
docker run --rm --network none -v "$root/..:/portal:ro" -w /portal/deployment/supabase/managed-atrium node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf node --test provenance.check.mjs

sh "$root/runtime-secrets/check.sh"

sh "$root/runtime-connections/check.sh"
