#!/usr/bin/env python3
"""Compare every exported tracked blob against the pinned Git tree without git checkout."""
from pathlib import Path
import hashlib, json, os, subprocess, sys
base=Path(__file__).resolve().parent.parent
if len(sys.argv)!=2: raise SystemExit('Usage: verify-pinned-source.py LOCAL_UPSTREAM_GIT_REPOSITORY')
repo=sys.argv[1]
commit='c4b0f1ebb9a7970d36493d4c3580f3f43e098fa5'
tree=subprocess.check_output(['git','-C',repo,'ls-tree','-rz','--full-tree',commit])
records=[]
for entry in tree.split(b'\0'):
    if not entry: continue
    metadata,path=entry.split(b'\t',1)
    mode,kind,oid=metadata.decode().split()
    if kind!='blob': raise ValueError(f'Unsupported git entry {kind} {path}')
    filename=path.decode(); dest=base/'source'/filename
    data=os.readlink(dest).encode() if mode=='120000' else dest.read_bytes()
    actual=hashlib.sha1(f'blob {len(data)}\0'.encode()+data).hexdigest()
    if actual!=oid: raise ValueError(f'Source mismatch {filename}')
    records.append({'path':filename,'mode':mode,'gitBlob':oid,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
(base/'evidence/pinned-source-file-manifest.json').write_text(json.dumps({'commit':commit,'trackedBlobCount':len(records),'allMatch':True,'files':records},indent=2)+'\n')
print(f'All {len(records)} tracked blobs match the pinned Git object IDs; full source/config/locks preserved')
