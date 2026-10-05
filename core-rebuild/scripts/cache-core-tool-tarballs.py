#!/usr/bin/env python3
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import json, subprocess, hashlib, base64, yaml
base=Path(__file__).resolve().parent.parent
lock=yaml.safe_load((base/'core-build-tools/pnpm-lock.yaml').read_text())
items=[]
for pkgdir in (base/'core-build-tools/node_modules/.pnpm').iterdir():
    if not pkgdir.is_dir() or pkgdir.name=='node_modules': continue
    manifests=list((pkgdir/'node_modules').glob('*/package.json'))+list((pkgdir/'node_modules').glob('@*/*/package.json'))
    for f in manifests:
        if f.parent.is_symlink(): continue
        p=json.loads(f.read_text()); key=p['name']+'@'+p['version']
        if key not in lock['packages']: raise ValueError(key)
        items.append({'name':p['name'],'version':p['version'],'integrity':lock['packages'][key]['resolution']['integrity'], 'url':f"https://registry.npmjs.org/{p['name']}/-/{p['name'].split('/')[-1]}-{p['version']}.tgz"})
manager_lock=list(yaml.safe_load_all((base/'source/pnpm-lock.yaml').read_text()))[0]
for name in ['pnpm','@pnpm/exe.linux-x64']:
    version='12.6.0'; key=name+'@'+version
    items.append({'name':name,'version':version,'integrity':manager_lock['packages'][key]['resolution']['integrity'],'url':f"https://registry.npmjs.org/{name}/-/{name.split('/')[-1]}-{version}.tgz"})
items.sort(key=lambda i:i['name']+'@'+i['version'])
def pack(item):
    cmd=['npm','pack',item['url'],'--ignore-scripts','--json','--pack-destination',str(base/'build-registry-tarballs'),'--cache',str(base/'npm-cache'),'--registry=https://registry.npmjs.org']
    cp=subprocess.run(cmd,cwd=base,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    if cp.returncode: raise RuntimeError(cp.stdout+cp.stderr)
    data=json.loads(cp.stdout)[0]; item['filename']=data['filename']
    raw=(base/'build-registry-tarballs'/item['filename']).read_bytes()
    actual='sha512-'+base64.b64encode(hashlib.sha512(raw).digest()).decode()
    if actual!=item['integrity']: raise ValueError(f"Integrity mismatch {item['name']}")
    item['sha256']=hashlib.sha256(raw).hexdigest(); item['bytes']=len(raw)
    print(f"verified {item['name']}@{item['version']} ({len(raw)} bytes)",flush=True)
    return item
with ThreadPoolExecutor(max_workers=8) as executor:
    results=list(executor.map(pack,items))
(base/'build-registry-tarballs/manifest.json').write_text(json.dumps(results,indent=2)+'\n')
print(f"Verified {len(results)} tool archives, {sum(i['bytes'] for i in results)} bytes")
