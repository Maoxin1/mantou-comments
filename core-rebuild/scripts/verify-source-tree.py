#!/usr/bin/env python3
"""Verify a freshly extracted source tree against the pinned Git-file manifest."""
from pathlib import Path
import hashlib, json, os, sys
source=Path(sys.argv[1]); manifest=json.loads(Path(sys.argv[2]).read_text())
for item in manifest['files']:
    p=source/item['path']
    raw=os.readlink(p).encode() if item['mode']=='120000' else p.read_bytes()
    if hashlib.sha256(raw).hexdigest()!=item['sha256']: raise SystemExit('Source mismatch: '+item['path'])
    if hashlib.sha1(f'blob {len(raw)}\0'.encode()+raw).hexdigest()!=item['gitBlob']: raise SystemExit('Git blob mismatch: '+item['path'])
print(f"Verified {len(manifest['files'])} exact source files from {manifest['commit']}")
