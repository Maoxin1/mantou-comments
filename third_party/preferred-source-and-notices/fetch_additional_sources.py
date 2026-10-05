import json,urllib.request,urllib.parse,hashlib,tarfile,concurrent.futures,re
from pathlib import Path
OUT=Path(__file__).resolve().parent
records=json.loads((OUT/'dependency-inventory.json').read_text())['packages']
candidates=[]
for r in records:
 s=' '.join(str(v) for k,v in r.get('scripts',{}).items() if any(t in k for t in ['build','compile','prepare','prepublish']))
 if ((r['editable_typescript_count']==0 and (any(n in r['top_level_entries'] for n in ['build','dist','es','esm','lib-esm']) or r['name'].startswith('@csstools')) and 'src' not in r['top_level_entries']) or any(t in s for t in ['tsc','babel','rollup','rolldown','webpack','tsdown','tsup','esbuild','coffee','browserify','Makefile']) or not r.get('notice_files')) and r.get('name') not in ['@waline/core','@waline/vercel']:
  candidates.append(r)
(OUT/'source-candidates.json').write_text(json.dumps(candidates,indent=2)+'\n')
def getmeta(r):
 n,v=r['name'],r['version']; dest=OUT/'registry'/(n.replace('/','__')+'.json'); u='https://registry.npmjs.org/'+urllib.parse.quote(n,safe='')+'/'+v
 try:
  data=dest.read_bytes() if dest.exists() else urllib.request.urlopen(u,timeout=30).read(); j=json.loads(data); dest.write_bytes(data)
  rep=j.get('repository'); rep=rep.get('url','') if isinstance(rep,dict) else (rep or '')
  m=re.search(r'github.com[/:]([^/]+/[^/#]+)',rep)
  if not m and rep.startswith('github:'): repo=rep[7:]
  elif m: repo=m[1]
  elif re.match(r'^[\w.-]+/[\w.-]+$',rep): repo=rep
  else:repo=None
  if repo:repo=re.sub(r'\.git$','',repo)
  return {'name':n,'version':v,'url':u,'metadata_file':str(dest.relative_to(OUT)),'sha256':hashlib.sha256(data).hexdigest(),'gitHead':j.get('gitHead'),'repo':repo,'repository':j.get('repository'),'build_source_needed':r['editable_typescript_count']==0}
 except Exception as e:return {'name':n,'version':v,'url':u,'error':str(e)}
metas=list(concurrent.futures.ThreadPoolExecutor(10).map(getmeta,candidates));(OUT/'additional-registry-summary.json').write_text(json.dumps(metas,indent=2)+'\n');print('Registry complete',len(metas),'missing gitHead',[(x['name'],x.get('error')) for x in metas if not x.get('gitHead')],flush=True)
already=json.loads((OUT/'upstream-archives.json').read_text()) + json.loads((OUT/'additional-upstream-archives.json').read_text()); by_key={(x['repo'].lower(),x['commit']):x for x in already if x.get('file')}
unique={}
for m in metas:
 if m.get('gitHead') and m.get('repo'):
  key=(m['repo'].lower(),m['gitHead']);unique.setdefault(key,[]).append(m)
def getsource(item):
 key,packages=item; m=packages[0]; repo=m['repo']; commit=m['gitHead']; url=f'https://codeload.github.com/{repo}/tar.gz/{commit}'; dest=OUT/'sources'/f"{repo.replace('/','__')}-{commit}.tar.gz"
 if key in by_key:
  out=dict(by_key[key]);out['packages']=[{'name':p['name'],'version':p['version']} for p in packages];return out
 try:
  data=urllib.request.urlopen(url,timeout=100).read(); dest.write_bytes(data)
  with tarfile.open(dest) as tf: entries=tf.getmembers(); notices=[m.name for m in entries if m.isfile() and any(x in m.name.lower().split('/')[-1] for x in ['license','copying','notice','copyright','ofl'])]
  return {'packages':[{'name':p['name'],'version':p['version']} for p in packages],'repo':repo,'commit':commit,'url':url,'file':str(dest.relative_to(OUT)),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'member_count':len(entries),'notice_paths':notices}
 except Exception as e:return {'packages':[{'name':p['name'],'version':p['version']} for p in packages],'repo':repo,'commit':commit,'url':url,'error':str(e)}
archives=list(concurrent.futures.ThreadPoolExecutor(8).map(getsource,unique.items()));(OUT/'additional-upstream-archives.json').write_text(json.dumps(archives,indent=2)+'\n');print('Archives complete',len(archives),'errors',[(x['repo'],x.get('error')) for x in archives if x.get('error')],flush=True)
