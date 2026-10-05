#!/usr/bin/env python3
"""Offline restore from integrity-verified official tarballs and locked pnpm layout.
This copies no prior node_modules directory and requires only Python stdlib.
Usage: python3 restore-core-tools.py LAYOUT_JSON TARBALL_DIRECTORY EMPTY_OUTPUT
"""
from pathlib import Path, PurePosixPath
import base64, hashlib, json, os, sys, tarfile
layout_path, archives, output=map(Path,sys.argv[1:])
layout=json.loads(layout_path.read_text()); output=output.resolve()
if output.exists() and any(output.iterdir()): raise SystemExit('Output directory must be empty')
output.mkdir(parents=True,exist_ok=True)
def destination(rel):
    p=PurePosixPath(rel)
    if p.is_absolute() or '..' in p.parts: raise ValueError(f'Unsafe output path {rel}')
    return output/p
for item in layout['packages']:
    archive=archives/item['filename']; data=archive.read_bytes()
    if hashlib.sha256(data).hexdigest()!=item['sha256']: raise ValueError(f'SHA256 mismatch: {archive}')
    integrity='sha512-'+base64.b64encode(hashlib.sha512(data).digest()).decode()
    if integrity!=item['integrity']: raise ValueError(f'Upstream lock integrity mismatch: {archive}')
    target=destination(item['path']); target.mkdir(parents=True,exist_ok=True)
    with tarfile.open(archive,'r:gz') as tar:
        for member in tar.getmembers():
            parts=PurePosixPath(member.name).parts
            if not parts or parts[0]!='package' or '..' in parts: raise ValueError(f'Unsafe archive entry {member.name}')
            if len(parts)==1: continue
            if not member.isfile() and not member.isdir(): raise ValueError(f'Unsupported entry type {member.name}')
            name=PurePosixPath(*parts[1:]); dest=target/name
            if member.isdir(): dest.mkdir(parents=True,exist_ok=True)
            else:
                dest.parent.mkdir(parents=True,exist_ok=True)
                with tar.extractfile(member) as src: dest.write_bytes(src.read())
                dest.chmod(member.mode & 0o777)
for item in layout['symlinks']:
    path=destination(item['path']); target=item['target']
    if os.path.isabs(target): raise ValueError('Absolute symlink')
    normalized=Path(os.path.normpath(path.parent/target))
    if not normalized.is_relative_to(output): raise ValueError('Escaping symlink')
    path.parent.mkdir(parents=True,exist_ok=True); path.symlink_to(target)
for item in layout['binShims']:
    path=destination(item['path']); path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(item['text']); path.chmod(item['mode'])
for item in layout['symlinks']:
    if not destination(item['path']).exists(): raise ValueError(f"Broken symlink: {item['path']}")
print(f"Restored {len(layout['packages'])} integrity-verified packages without network access")
