#!/usr/bin/env bash
# Offline source reconstruction and build for Linux x64/glibc.
set -euo pipefail
bundle=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
if [ "$#" -ne 1 ]; then echo "Usage: NODE_BIN=/path/to/node24.20.0 $0 EMPTY_OUTPUT_DIRECTORY" >&2; exit 2; fi
node_bin=${NODE_BIN:-node}
if [ "$("$node_bin" --version)" != "v24.20.0" ]; then echo 'Requires Node.js v24.20.0; set NODE_BIN to that executable' >&2; exit 2; fi
output=$1
if [ -e "$output" ]; then echo 'Output path must not already exist' >&2; exit 2; fi
mkdir -p "$output/source"
output=$(CDPATH= cd -- "$output" && pwd -P)
archive="$bundle/archives/waline-c4b0f1ebb9a7970d36493d4c3580f3f43e098fa5.tar.gz"
printf '%s  %s\n' '35b81cf1b3b99ba568553f226cae38f97ccdf7a36e788a8204787299c9dc5949' "$archive" | sha256sum --check --status
# No build artifacts or dependencies exist in the pinned source archive.
tar -xzf "$archive" --strip-components=1 -C "$output/source"
test ! -e "$output/source/packages/core/dist"
test ! -e "$output/source/packages/core/node_modules"
python3 "$bundle/scripts/verify-source-tree.py" "$output/source" "$bundle/evidence/pinned-source-file-manifest.json"
python3 "$bundle/scripts/restore-core-tools.py" "$bundle/core-build-tools/tool-layout.json" "$bundle/build-registry-tarballs" "$output/tools"
ln -s ../../../tools/node_modules "$output/source/packages/core/node_modules"
export PATH="$(dirname -- "$(command -v "$node_bin")"):$output/tools/node_modules/.bin:$PATH"
unset NODE_PATH
export npm_config_offline=true
cd "$output/source/packages/core"
printf 'Runtime: '; "$node_bin" --version
"$node_bin" "$output/tools/node_modules/tsdown/dist/run.mjs"
python3 - "$output/source/packages/core/dist" <<'PY'
from pathlib import Path
import hashlib, json, sys
p=Path(sys.argv[1])
expected={
 'index.js':'cab3b45c1f682364e1d859163a364f4d2c7928c8c3be479d946d65c1e3831b50',
 'index.cjs':'eb67ef3068bafa975714250ce4d48781cf79f6773a5443866e58025a44d9caf5',
 'index.d.ts':'42e613818d93515b26d0f16659aeab50568b1ade71308e32b702f80d1a3b8128',
 'index.d.cts':'42e613818d93515b26d0f16659aeab50568b1ade71308e32b702f80d1a3b8128',
}
assert set(x.name for x in p.iterdir())==set(expected), 'Unexpected output files'
for name,digest in expected.items():
    actual=hashlib.sha256((p/name).read_bytes()).hexdigest()
    assert actual==digest, f'Byte mismatch: {name}: {actual}'
    print(f'MATCH {name} {actual}')
print('All four generated files match the shipped baseline SHA-256 values')
PY
