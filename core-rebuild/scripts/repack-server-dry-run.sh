#!/usr/bin/env bash
# Repack only. This guard never permits the upstream script's publish branch.
set -euo pipefail
bundle=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
if [ "$#" -ne 2 ]; then echo "Usage: $0 EXISTING_REBUILD_DIRECTORY NEW_PACK_DIRECTORY" >&2; exit 2; fi
node_bin=${NODE_BIN:-node}
if [ "$("$node_bin" --version)" != 'v24.20.0' ]; then echo 'Requires Node.js v24.20.0' >&2; exit 2; fi
export PATH="$(dirname -- "$(command -v "$node_bin")"):$PATH"
if [ "$(npm --version)" != '11.9.0' ]; then echo 'Exact archive comparison requires npm 11.9.0' >&2; exit 2; fi
build=$(CDPATH= cd -- "$1" && pwd -P)
source_root="$build/source"
python3 "$bundle/scripts/verify-source-tree.py" "$source_root" "$bundle/evidence/pinned-source-file-manifest.json"
python3 - "$source_root/packages/core/dist" <<'PY'
from pathlib import Path
import hashlib,sys
root=Path(sys.argv[1])
expected={'index.js':'cab3b45c1f682364e1d859163a364f4d2c7928c8c3be479d946d65c1e3831b50','index.cjs':'eb67ef3068bafa975714250ce4d48781cf79f6773a5443866e58025a44d9caf5','index.d.ts':'42e613818d93515b26d0f16659aeab50568b1ade71308e32b702f80d1a3b8128','index.d.cts':'42e613818d93515b26d0f16659aeab50568b1ade71308e32b702f80d1a3b8128'}
for name,sha in expected.items():
 if hashlib.sha256((root/name).read_bytes()).hexdigest()!=sha: raise SystemExit('Core mismatch: '+name)
PY
if [ -e "$2" ]; then echo 'Pack destination must not already exist' >&2; exit 2; fi
mkdir -p "$2"
output=$(CDPATH= cd -- "$2" && pwd -P)
export npm_config_offline=true
# Fixed flags are intentional. No caller-supplied flags are passed through.
"$node_bin" "$source_root/scripts/publish-server.js" --dry-run --skip-build --pack-destination "$output"
printf '%s  %s\n' 'd719b6592178d0ad6f93a803def4b93cbb27fa812b6742dc32f732abed788a7c' "$output/waline-vercel-1.43.4.tgz" | sha256sum --check
