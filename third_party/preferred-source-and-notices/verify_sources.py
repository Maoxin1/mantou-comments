import json,tarfile,hashlib,re
from pathlib import Path
O=Path(__file__).resolve().parent; BUNDLE_ROOT=O.parents[1]; R=(BUNDLE_ROOT/'application' if (BUNDLE_ROOT/'application').is_dir() else BUNDLE_ROOT)/'node_modules'
A=json.loads((O/'additional-upstream-archives.json').read_text())
res=[];notice_rows=[]
for a in A:
 if not a.get('file'):
  res.append(a);continue
 with tarfile.open(O/a['file']) as tf:
  members={m.name.split('/',1)[1]:m for m in tf.getmembers() if m.isfile() and '/' in m.name}
  manifest=[]
  for rel,m in members.items():
   if rel.endswith('package.json'):
    try:p=json.loads(tf.extractfile(m).read());manifest.append((rel,p))
    except:continue
   if any(x in Path(rel).name.lower() for x in ['license','licence','notice','copying','copyright','ofl']):
    data=tf.extractfile(m).read(); dest=O/'upstream-notices'/a['repo']/a['commit']/rel
    dest.parent.mkdir(exist_ok=True,parents=True);dest.write_bytes(data)
    notice_rows.append({'repo':a['repo'],'commit':a['commit'],'archive':a['file'],'path':rel,'file':str(dest.relative_to(O)),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
  for p in a.get('packages',[]):
   named=[(rel,m) for rel,m in manifest if m.get('name')==p['name']]
   exact=[(rel,m) for rel,m in named if m.get('version')==p['version']]
   choices=exact or named
   rec={**p,'repo':a['repo'],'commit':a['commit'],'archive':a['file'],'upstream_manifest_candidates':[{'path':rel,'version':m.get('version')} for rel,m in choices]}
   if len(choices)==1:
    manifest_rel,up=choices[0];prefix=manifest_rel[:-len('package.json')];installed=next(r for r in json.loads((O/'dependency-inventory.json').read_text())['packages'] if r.get('name')==p['name'] and r.get('version')==p['version']);base=R.parent/installed['path'];ip=json.loads((base/'package.json').read_text()); equal=[];different=[]
    for rel,m in members.items():
     if not rel.startswith(prefix):continue
     sub=rel[len(prefix):];f=base/sub
     if f.is_file():
      a_bytes=tf.extractfile(m).read();b_bytes=f.read_bytes()
      (equal if a_bytes==b_bytes else different).append(sub)
    rec.update({'package_prefix':prefix,'upstream_version_matches':up.get('version')==p['version'],'manifest_json_identical':up==ip,'manifest_differing_keys':sorted(k for k in up.keys()|ip.keys() if up.get(k)!=ip.get(k)),'overlap_matching_files':len(equal),'overlap_different_files':different,'editable_typescript_files_in_upstream_package':sum(rel.startswith(prefix) and rel.endswith(('.ts','.tsx')) and not rel.endswith(('.d.ts','.d.cts','.d.mts')) for rel in members),'source_subdirs_present':[n for n in ['src','lib','ts','scripts','script','build','config','fonts','dockers','data'] if any(rel.startswith(prefix+n+'/') for rel in members)]})
   res.append(rec)
(O/'source-package-mapping.json').write_text(json.dumps(res,indent=2)+'\n'); (O/'upstream-notice-inventory.json').write_text(json.dumps(notice_rows,indent=2)+'\n')
print('mapped',len(res),'upstream notices',len(notice_rows))
for r in res:
 if len(r.get('upstream_manifest_candidates',[]))!=1 or not r.get('upstream_version_matches'):print('CHECK',r)
print('Non-manifest overlap differences:')
for r in res:
 dif=[x for x in r.get('overlap_different_files',[]) if x!='package.json']
 if dif:print(r['name'],dif[:25],len(dif))
