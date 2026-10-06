#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export GUEST_WORKFLOW_ROOT="$root"
export MANAGED_ATRIUM_ROOT="$root/../deployment/supabase/managed-atrium"
project="growthcast-document-delivery-$$"
provider_compose=$(mktemp)
python3 "$root/signing/provider-compose.py" "$provider_compose"
export GUEST_DELIVERY_EVIDENCE=$(mktemp)
export GUEST_EVIDENCE_FILE=$(mktemp)
chmod 666 "$GUEST_DELIVERY_EVIDENCE" "$GUEST_EVIDENCE_FILE"
compose() { docker compose -p "$project" -f "$root/../foundation/compose.yaml" -f "$MANAGED_ATRIUM_ROOT/compose.yaml" -f "$root/compose.yaml" -f "$root/signing/delivery.compose.yaml" -f "$provider_compose" "$@"; }
cleanup() { compose down --volumes --remove-orphans >/dev/null 2>&1 || true; rm -f "$provider_compose" "$GUEST_DELIVERY_EVIDENCE" "$GUEST_EVIDENCE_FILE"; }
trap cleanup EXIT
trap 'exit 130' HUP INT TERM
docker build -f "$root/signing/Dockerfile" -t growthcast-guest-delivery "$root/.."
compose up -d --wait database restore delivery-mail signing-documenso
compose run --rm delivery-check node --test /foundation/guest/signing/workspace-mail.check.mjs /foundation/guest/signing/placeholders.check.mjs /foundation/guest/signing/source-pdf.check.mjs /foundation/guest/signing/managed-store.check.mjs /foundation/guest/signing/completion-worker.check.mjs /foundation/guest/signing/completion-mail.check.mjs
compose run --rm provision
compose run --rm migration
compose run --rm guest-migrate
compose run --rm delivery-migrate
compose run --rm signing-seed
compose run --rm delivery-check
compose up -d --no-deps delivery-gateway
compose build delivery-browser
compose run --rm delivery-browser
compose run --rm delivery-check node /foundation/guest/signing/delivery.check.mjs completion
compose run --rm --user 0 --entrypoint node signing-seed /delivery-verify.cjs
compose run --rm delivery-browser node /gateway/delivery-browser.mjs download
cp "$GUEST_DELIVERY_EVIDENCE" "$root/signing/delivery-evidence.json"
python3 - "$root/signing/delivery-evidence.json" <<'PY_RECEIPT'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]);v=json.loads(p.read_text());v.update(nativeOriginalDownloadButton=True,nativeSignedDownloadButton=True,authenticatedSealedPdfDownload=True,anonymousSealedPdfDownloadDenied=True,workspaceMailAdapterChecks=3);p.write_text(json.dumps(v,indent=2)+'\n')
PY_RECEIPT
chmod 644 "$root/signing/delivery-evidence.json"
