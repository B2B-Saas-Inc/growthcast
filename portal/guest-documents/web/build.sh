#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
context=$(mktemp -d)
trap 'rm -rf "$context"' EXIT
python3 -B - "$root" "$context" <<'PY'
import sys
from pathlib import Path
sys.path.insert(0,str(Path(sys.argv[1]).parents[1]/'deployment/web-app'))
from prepare import prepare
prepare(sys.argv[2])
import importlib.util
spec=importlib.util.spec_from_file_location('guest_ui',Path(sys.argv[1])/'prepare.py');ui=importlib.util.module_from_spec(spec);spec.loader.exec_module(ui);ui.apply(Path(sys.argv[2])/'apps/web')
PY
cat > "$context/Dockerfile.library" <<'DOCKER'
FROM oven/bun:1.3.9@sha256:856da45d07aeb62eb38ea3e7f9e1794c0143a4ff63efb00e6c4491b627e2a521
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts
RUN bun run --filter @atrium/web build
WORKDIR /app/apps/web
CMD ["bun","run","start"]
DOCKER
docker build -f "$context/Dockerfile.library" -t growthcast-guest-web "$context"
