#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
secrets=${PORTAL_STAGING_SECRETS:-"$HOME/.config/growthcast/portal-staging"}
volume="growthcast-job-source-$$"
trap 'docker volume rm "$volume" >/dev/null 2>&1 || true' EXIT HUP INT TERM
docker volume create "$volume" >/dev/null
docker run --rm --network none --user root --entrypoint sh -v "$secrets/backup-database-url:/input/database-url:ro" -v "$secrets/prod-ca-2021.crt:/input/prod-ca-2021.crt:ro" -v "$secrets/backup-storage-credentials.json:/input/storage-credentials.json:ro" -v "$volume:/output" growthcast-backup-job -ec 'cp /input/* /output/; chown -R 10001:10001 /output; chmod 700 /output; chmod 400 /output/*'
docker run --rm --network none --read-only --cap-drop ALL --entrypoint node -v "$volume:/source:ro" growthcast-backup-job --input-type=module -e 'import {readFileSync as r} from "node:fs";import {validateSecret} from "/app/deployment/backup/job/core.mjs";validateSecret({schemaVersion:2,projectRef:"saedetvoolpdysiyjwvg",role:"gc_backup",databaseUrl:r("/source/database-url","utf8").trim(),databaseCaCert:r("/source/prod-ca-2021.crt","utf8"),storageCredentials:JSON.parse(r("/source/storage-credentials.json","utf8"))});console.log("Packaged source-secret validation passed.")'
docker run --rm --read-only --cap-drop ALL --security-opt no-new-privileges --tmpfs /snapshot:uid=10001,gid=10001,mode=700,size=512m --entrypoint node -v "$volume:/source:ro" growthcast-backup-job /app/deployment/backup/capture.mjs
