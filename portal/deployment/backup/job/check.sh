#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
docker build -f "$root/Dockerfile" -t growthcast-backup-job "$root/../../.."
docker run --rm --network none --read-only --entrypoint node growthcast-backup-job --check /app/deployment/backup/job/main.mjs
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:uid=10001,gid=10001,mode=700 --entrypoint node -v "$root/core.check.mjs:/checks/core.check.mjs:ro" -v "$root/core.mjs:/checks/core.mjs:ro" growthcast-backup-job --test /checks/core.check.mjs
docker run --rm --network none --read-only --entrypoint node growthcast-backup-job --input-type=module -e 'import {fromContainerMetadata} from "@aws-sdk/credential-providers"; import {S3Client} from "@aws-sdk/client-s3"; if(typeof fromContainerMetadata!=="function" || typeof S3Client!=="function")process.exit(1)'
if docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --tmpfs /work:uid=10001,gid=10001,mode=700 growthcast-backup-job; then
 echo 'Job accepted missing ECS credentials'; exit 1
fi
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --entrypoint node growthcast-backup-job -e 'const a=require("node:assert/strict"),f=require("node:fs");a.equal(process.getuid(),10001);a.throws(()=>f.writeFileSync("/app/escape","x"));a.equal(f.existsSync("/root/.aws"),false);a.equal(f.existsSync("/source"),false);console.log("Non-root read-only package and absent embedded source credentials verified.")'
