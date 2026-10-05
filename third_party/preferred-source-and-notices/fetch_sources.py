import json,urllib.request,urllib.parse,hashlib,tarfile,concurrent.futures
from pathlib import Path
OUT=Path(__file__).resolve().parent; (OUT/'registry').mkdir(exist_ok=True); (OUT/'sources').mkdir(exist_ok=True)
names={'ua-parser-js':'2.0.10','@mathjax/src':'4.1.3','@mathjax/mathjax-newcm-font':'4.1.3','@mathjax/mathjax-tex-font':'4.1.3','speech-rule-engine':'5.0.0-rc.4','mj-context-menu':'1.0.0','mhchemparser':'4.2.1','@mathjax/font-tools':None}
def getmeta(n):
 v=names[n]; u='https://registry.npmjs.org/'+urllib.parse.quote(n,safe='')+('/'+v if v else '')
 try:
  data=urllib.request.urlopen(u,timeout=35).read(); j=json.loads(data)
  (OUT/'registry'/(n.replace('/','__')+'.json')).write_bytes(data)
  return {'name':n,'requested_version':v,'url':u,'file':str((OUT/'registry'/(n.replace('/','__')+'.json')).relative_to(OUT)),'sha256':hashlib.sha256(data).hexdigest(),'version':j.get('version'),'gitHead':j.get('gitHead'),'repository':j.get('repository'),'dist':j.get('dist'),'dist-tags':j.get('dist-tags')}
 except Exception as e:return {'name':n,'requested_version':v,'url':u,'error':str(e)}
meta=list(concurrent.futures.ThreadPoolExecutor(8).map(getmeta,names)); (OUT/'registry-summary.json').write_text(json.dumps(meta,indent=2)+'\n');print(json.dumps(meta,indent=2),flush=True)
sources=[('ua-parser-js','faisalman/ua-parser-js','4121c59060c3f9b814f07978c361e44016028c74'),('mathjax-src','mathjax/MathJax-src','fb987178c2d279a99b0db5ea02e751691703955e'),('speech-rule-engine','Speech-Rule-Engine/speech-rule-engine','d60c0650509e1dd9db004d22b077d05b63507657')]
def download(args):
 n,repo,commit=args; url=f'https://codeload.github.com/{repo}/tar.gz/{commit}'; dest=OUT/'sources'/f'{n}-{commit}.tar.gz'
 try:
  data=urllib.request.urlopen(url,timeout=90).read(); dest.write_bytes(data)
  with tarfile.open(dest) as tf:
   entries=tf.getmembers(); notices=[m.name for m in entries if m.isfile() and any(x in m.name.lower().split('/')[-1] for x in ['license','copying','notice','copyright','ofl'])]
  return {'name':n,'repo':repo,'commit':commit,'url':url,'file':str(dest.relative_to(OUT)),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'member_count':len(entries),'notice_paths':notices}
 except Exception as e:return {'name':n,'repo':repo,'commit':commit,'url':url,'error':str(e)}
archives=list(concurrent.futures.ThreadPoolExecutor(3).map(download,sources)); (OUT/'upstream-archives.json').write_text(json.dumps(archives,indent=2)+'\n');print(json.dumps(archives,indent=2),flush=True)
