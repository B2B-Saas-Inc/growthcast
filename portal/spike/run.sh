#!/bin/sh
set -eu
spike_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
upstream_dir=${1:?Usage: sh portal/spike/run.sh /absolute/path/to/documenso-checkout}
expected_revision=389390c884949fe27c240488a3259da3cdba93e0
actual_revision=$(git -C "$upstream_dir" rev-parse HEAD)
if [ "$actual_revision" != "$expected_revision" ]; then
  echo 'Refusing an unreviewed Documenso revision.' >&2
  exit 1
fi
git -C "$upstream_dir" diff --exit-code HEAD -- >/dev/null
upstream_dir=$(CDPATH= cd -- "$upstream_dir" && pwd)
docker build -t growthcast-portal-spike "$spike_dir"
docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --pids-limit 128 --memory 256m --cpus 1 \
  --tmpfs /tmp:rw,noexec,nosuid,size=32m \
  --mount "type=bind,source=$upstream_dir,target=/upstream/documenso,readonly" \
  growthcast-portal-spike
