#!/usr/bin/env python3
from pathlib import Path
import json, os, hashlib
base=Path(__file__).resolve().parent.parent
root=base/'core-build-tools'
manifest=json.loads((base/'build-registry-tarballs/manifest.json').read_text())
by_key={i['name']+'@'+i['version']: i for i in manifest}
layout={'format':1,'platform':'linux-x64-glibc','node':'24.20.0','packages':[],'symlinks':[],'binShims':[]}
for pkgdir in (root/'node_modules/.pnpm').iterdir():
    if not pkgdir.is_dir() or pkgdir.name=='node_modules': continue
    for f in list((pkgdir/'node_modules').glob('*/package.json'))+list((pkgdir/'node_modules').glob('@*/*/package.json')):
        if f.parent.is_symlink(): continue
        p=json.loads(f.read_text()); item=by_key[p['name']+'@'+p['version']]
        layout['packages'].append({'path':str(f.parent.relative_to(root)),**item})
for p in sorted((root/'node_modules').rglob('*')):
    if p.is_symlink():
        target=os.readlink(p)
        assert p.resolve().is_relative_to(root), (p,target)
        layout['symlinks'].append({'path':str(p.relative_to(root)),'target':target})
    elif p.is_file() and '.bin' in p.relative_to(root).parts:
        content=p.read_text()
        assert '/workspace/' not in content
        layout['binShims'].append({'path':str(p.relative_to(root)),'text':content,'mode':p.stat().st_mode & 0o777})
for name in ['pnpm','@pnpm/exe.linux-x64']:
    layout['packages'].append({'path':'node_modules/'+name,**by_key[name+'@12.6.0']})
for name in ['pnpm','pn','pnpx','pnx']:
    layout['symlinks'].append({'path':'node_modules/.bin/'+name,'target':'../pnpm/'+name})
layout['packages'].sort(key=lambda i:i['path'])
(base/'core-build-tools/tool-layout.json').write_text(json.dumps(layout,indent=2)+'\n')
print('Captured',len(layout['packages']),'packages,',len(layout['symlinks']),'symlinks,',len(layout['binShims']),'relocatable shims')
