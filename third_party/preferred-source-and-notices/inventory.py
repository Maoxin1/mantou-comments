from pathlib import Path
import os,json,hashlib,re,shutil,collections,subprocess,sys,types
BUNDLE_ROOT=Path(__file__).resolve().parents[2]
ROOT=BUNDLE_ROOT/'application' if (BUNDLE_ROOT/'application').is_dir() else BUNDLE_ROOT
OUT=Path(__file__).resolve().parent
lock=json.loads((ROOT/'package-lock.json').read_text())
records=[]
for rel,entry in lock['packages'].items():
 if not rel: continue
 pkgdir=ROOT/rel
 pf=pkgdir/'package.json'
 if not pf.exists():
  records.append({'path':rel,'version':entry.get('version'),'installed':False,'lock':entry}); continue
 p=json.loads(pf.read_text())
 files=[]
 for dp,dn,fn in os.walk(pkgdir):
  dn[:]=[x for x in dn if x not in ['node_modules','.git']]
  for n in fn: files.append(Path(dp)/n)
 notices=[]
 for f in files:
  if re.search(r'(licen[cs]e|notice|copying|copyright|authors|ofl)',f.name,re.I):
   data=f.read_bytes(); r=f.relative_to(pkgdir).as_posix()
   notices.append({'path':r,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
   dst=OUT/'notices'/rel/r; dst.parent.mkdir(parents=True,exist_ok=True); dst.write_bytes(data)
 ts=[str(f.relative_to(pkgdir)) for f in files if f.suffix in ['.ts','.tsx'] and not f.name.endswith(('.d.ts','.d.cts','.d.mts'))]
 rec={'path':rel,'name':p.get('name'),'version':p.get('version'),'installed':True,'declared_license':p.get('license'),'legacy_licenses':p.get('licenses'),'lock_license':entry.get('license'),'repository':p.get('repository'),'homepage':p.get('homepage'),'main':p.get('main'),'module':p.get('module'),'scripts':p.get('scripts',{}),'resolved':entry.get('resolved'),'integrity':entry.get('integrity'),'package_json_sha256':hashlib.sha256(pf.read_bytes()).hexdigest(),'file_count_excluding_nested_node_modules':len(files),'top_level_entries':sorted(x.name for x in pkgdir.iterdir() if x.name!='node_modules'),'editable_typescript_count':len(ts),'editable_typescript_samples':ts[:10],'notice_files':notices,'preferred_source_status':'Not individually established by inventory; inspect build scripts and upstream source before asserting completeness'}
 records.append(rec)
(OUT/'dependency-inventory.json').write_text(json.dumps({'audited_root':'application' if ROOT.name=='application' else '.','lock_sha256':hashlib.sha256((ROOT/'package-lock.json').read_bytes()).hexdigest(),'scope':'Every package-lock packages entry except root; nested dependency notices counted in their own entries; presence of JS is not proof of preferred-source completeness','packages':records},indent=2)+'\n')
# Installed brotli support is missing in Python; use existing Node built-in decoder, without installing anything.
brotli=types.ModuleType('brotli')
brotli.decompress=lambda data:subprocess.run(['node','-e',"let c=[]; process.stdin.on('data',x=>c.push(x)); process.stdin.on('end',()=>process.stdout.write(require('node:zlib').brotliDecompressSync(Buffer.concat(c))));"],input=data,stdout=subprocess.PIPE,check=True).stdout
sys.modules['brotli']=brotli
from fontTools.ttLib import TTFont
fonts=[]
for f in sorted((ROOT/'node_modules/@mathjax').rglob('*.woff2')):
 t=TTFont(f)
 names={}
 for x in t['name'].names:
  if x.nameID in [0,1,5,7,8,9,11,13,14]: names.setdefault(str(x.nameID),[]).append(x.toUnicode())
 names={k:sorted(set(v)) for k,v in names.items()}
 fonts.append({'path':f.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'bytes':f.stat().st_size,'name_records':names,'extended_metadata':t.flavorData.metaData.decode('utf8','replace') if t.flavorData.metaData else None})
(OUT/'font-metadata.json').write_text(json.dumps(fonts,indent=2,ensure_ascii=False)+'\n')
summary={'packages':len(records),'installed':sum(r.get('installed',False) for r in records),'notice_files':sum(len(r.get('notice_files',[])) for r in records),'no_notice_files':[(r.get('name'),r.get('version'),r.get('declared_license')) for r in records if r.get('installed') and not r.get('notice_files')],'fonts':len(fonts),'font_legal_groups':[]}
groups={}
for f in fonts:
 legal={k:v for k,v in f['name_records'].items() if k in ['0','7','8','9','11','13','14']}
 key=json.dumps(legal,sort_keys=True)
 groups.setdefault(key,[]).append(f['path'])
for k,v in groups.items(): summary['font_legal_groups'].append({'legal':json.loads(k),'count':len(v),'sample':v[0]})
(OUT/'inventory-summary.json').write_text(json.dumps(summary,indent=2,ensure_ascii=False)+'\n')
print(json.dumps(summary,indent=2,ensure_ascii=False))
