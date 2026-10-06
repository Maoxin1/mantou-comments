'use strict';
// Serves only the four hash-verified Hugo pages and their selected assets.
// The caller owns host, project, configuration, expiry and deployment gates.
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const PAGES=new Set(['/p/20260803/','/en/p/20260803/','/works/mantou-checklist-pwa/','/en/works/mantou-checklist-pwa/']);
const TYPES={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.gif':'image/gif','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'};
function createAcceptancePreview({origin,directory=path.join(process.cwd(),'preview-site')}={}){
  const base=new URL(origin);
  if(base.protocol!=='https:'||base.origin!==origin||base.username||base.password)throw new TypeError('Invalid preview origin');
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'asset-manifest.json'),'utf8'));
  if(!Array.isArray(manifest.files)||manifest.files.length>150)throw new TypeError('Invalid preview manifest');
  const entries=new Map();
  for(const file of manifest.files){
    if(typeof file.url!=='string'||!file.url.startsWith('/')||file.url.includes('?')||entries.has(file.url)||typeof file.file!=='string'||file.file.includes('\\')||!/^\w[\w./-]*$/.test(file.file)||file.file.split('/').some(p=>p==='..'||p==='.')||!TYPES[path.extname(file.file)]||!Number.isSafeInteger(file.bytes)||file.bytes<0||file.bytes>5000000||!/^[a-f0-9]{64}$/.test(file.sha256))throw new TypeError('Invalid preview entry');
    const page=PAGES.has(file.url);
    if((path.extname(file.file)==='.html')!==page||(!page&&!/^\/(?:css|js|lib|images)\//.test(file.url)&&!/^\/(?:favicon(?:-\d+x\d+)?\.(?:ico|png)|apple-touch-icon\.png)$/.test(file.url)))throw new TypeError('Invalid preview scope');
    entries.set(file.url,file);
  }
  if([...PAGES].some(p=>!entries.has(p)))throw new TypeError('Missing preview page');
  const cache=new Map();
  const entryFor=raw=>{
    if(typeof raw!=='string'||!raw.startsWith('/')||raw.startsWith('//')||raw.includes('#'))return;
    const url=new URL(raw,origin);
    if(url.pathname!==raw.split('?')[0])return;
    if(url.search&&(!/^\?retry=[1-9]\d?$/.test(url.search)||PAGES.has(url.pathname)))return;
    return entries.get(url.pathname);
  };
  return {
    canServe:raw=>Boolean(entryFor(raw)),
    serve(req,res){
      const file=entryFor(req.url);
      if(req.method!=='GET'||!file)throw new TypeError('Invalid preview request');
      let content=cache.get(file.file);
      if(!content){
        const target=path.resolve(directory,file.file);
        if(!target.startsWith(path.resolve(directory)+path.sep))throw new TypeError('Invalid preview path');
        content=fs.readFileSync(target);
        if(content.length!==file.bytes||createHash('sha256').update(content).digest('hex')!==file.sha256)throw new TypeError('Preview content mismatch');
        cache.set(file.file,content);
      }
      if(PAGES.has(file.url)){
        let html=content.toString('utf8');
        const matches=[...html.matchAll(/data-feedback-server=(?:"https:\/\/comments\.example\.test"|'https:\/\/comments\.example\.test'|https:\/\/comments\.example\.test(?=[\s>]))/g)];
        if(matches.length!==1)throw new TypeError('Unexpected preview server attribute');
        html=html.replace(matches[0][0],`data-feedback-server="${origin}"`);
        // Reactions are outside this comment-only acceptance's write scope.
        // The loader still reads the genuine counter endpoint to initialize.
        html=html.replace('</head>','<style>[data-feedback-helpful],.wl-like{display:none!important}</style></head>');
        content=Buffer.from(html);
      }
      res.statusCode=200;
      res.setHeader('content-type',TYPES[path.extname(file.file)]);
      res.setHeader('cache-control','no-store');
      res.setHeader('x-content-type-options','nosniff');
      res.setHeader('x-robots-tag','noindex, nofollow, noarchive');
      res.setHeader('referrer-policy','same-origin');
      res.setHeader('content-security-policy',"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'");
      return res.end(content);
    }
  };
}
module.exports={createAcceptancePreview,ACCEPTANCE_PAGES:[...PAGES]};
