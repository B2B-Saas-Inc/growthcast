#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
mkdir -p "$root/checkouts"
prepare() {
  name=$1 source=$2 revision=$3 upstream=$4
  [ "$(git -C "$source" rev-parse HEAD)" = "$revision" ]
  git -C "$source" diff --exit-code HEAD -- >/dev/null
  target="$root/checkouts/$name"
  if [ ! -d "$target" ]; then
    git clone --no-hardlinks --no-checkout "$source" "$target"
    git -C "$target" remote remove origin
    git -C "$target" remote add upstream "$upstream"
    git -C "$target" switch -c growthcast/portal-foundation "$revision"
  fi
  [ "$(git -C "$target" rev-parse HEAD)" = "$revision" ]
  [ "$(git -C "$target" remote get-url upstream)" = "$upstream" ]
  git -C "$target" diff --exit-code HEAD -- >/dev/null
}
prepare atrium "${1:?Atrium source checkout required}" 1a94a30b9aabe0e2d444c9239c4898d18b0dd5e2 https://github.com/Vibra-Labs/Atrium.git
prepare documenso "${2:?Documenso source checkout required}" 389390c884949fe27c240488a3259da3cdba93e0 https://github.com/documenso/documenso.git
