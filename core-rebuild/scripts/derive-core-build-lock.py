#!/usr/bin/env python3
"""Derive an install-only minimal lock; original source and lock stay untouched."""
from pathlib import Path
import json, re, yaml
base=Path(__file__).resolve().parent.parent
source_lock=base/'source/pnpm-lock.yaml'
lock=list(yaml.safe_load_all(source_lock.read_text()))[1]
core=lock['importers']['packages/core']['devDependencies']
snapshots=lock['snapshots']; packages=lock['packages']
queue=[name+'@'+dep['version'] for name, dep in core.items()]
selected={}
while queue:
    key=queue.pop()
    if key in selected: continue
    if key not in snapshots: raise ValueError(f'Unresolved snapshot {key}')
    selected[key]=snapshots[key]
    for group in ['dependencies','optionalDependencies']:
        queue.extend(name+'@'+ref for name,ref in snapshots[key].get(group,{}).items())
keys=sorted(set(re.sub(r'\(.*$','',key) for key in selected))
for key in keys:
    if key not in packages: raise ValueError(f'Unresolved package {key}')
manifest={'name':'waline-core-reproduction-tools','version':'1.0.0','private':True,
 'description':'Install-only tool closure derived from pinned Waline upstream lock; not published',
 'engines':{'node':'24.20.0'},
 'devDependencies':{name:re.sub(r'\(.*$','',dep['version']) for name,dep in core.items()}}
importer={'devDependencies':{name:{'specifier':manifest['devDependencies'][name],'version':dep['version']} for name,dep in core.items()}}
minimal={'lockfileVersion':'9.0','settings':lock['settings'],'importers':{'.':importer},
 'packages':{key:packages[key] for key in keys},'snapshots':{key:selected[key] for key in sorted(selected)}}
(base/'core-build-tools/package.json').write_text(json.dumps(manifest,indent=2)+'\n')
(base/'core-build-tools/pnpm-lock.yaml').write_text(yaml.safe_dump(minimal,sort_keys=False,width=150))
(base/'evidence/core-build-lock-derivation.json').write_text(json.dumps({'sourceCommit':'c4b0f1ebb9a7970d36493d4c3580f3f43e098fa5','sourceLock':'source/pnpm-lock.yaml','sourceImporter':'packages/core','algorithm':'Transitively retain dependencies and optionalDependencies of the exact core devDependency snapshots; preserve package metadata and integrity. Convert direct specifiers to the exact resolved versions. Original full-repository source/lock are unchanged.','packageCount':len(keys),'snapshotCount':len(selected),'packageKeys':keys},indent=2)+'\n')
print(f'Derived exact closure: {len(keys)} package versions and {len(selected)} snapshots')
