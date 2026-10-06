'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
const {createAcceptancePreview,ACCEPTANCE_PAGES}=require('../src/acceptance-preview.cjs');
const ORIGIN='https://mantou-comments-synthetic-mantous-projects-af7e7067.vercel.app';
function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mantou-synthetic-preview-'));
 const files=ACCEPTANCE_PAGES.map((url,i)=>({url,file:`page${i}.html`,data:'<html><head></head><body><div data-feedback-server=https://comments.example.test>Fixture</div></body></html>'}));
 files.push({url:'/js/synthetic.js',file:'js/synthetic.js',data:'/* synthetic asset */'});
 for(const f of files){fs.mkdirSync(path.dirname(path.join(dir,f.file)),{recursive:true});fs.writeFileSync(path.join(dir,f.file),f.data);Object.assign(f,{bytes:Buffer.byteLength(f.data),sha256:createHash('sha256').update(f.data).digest('hex')});delete f.data;}
 fs.writeFileSync(path.join(dir,'asset-manifest.json'),JSON.stringify({files}));
 return{dir,files,dispose:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('acceptance preview: only fixed pages and manifest assets, same-origin server and no reaction writer UI',()=>{
 const f=fixture();try{
  const preview=createAcceptancePreview({origin:ORIGIN,directory:f.dir});
  for(const url of ACCEPTANCE_PAGES){const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=v.toString();}};preview.serve({url,method:'GET'},res);assert.equal(res.statusCode,200);assert.match(res.body,new RegExp(`data-feedback-server="${ORIGIN.replaceAll('.','\\.')}"`));assert.match(res.body,/data-feedback-helpful.*display:none!important/);assert.equal(res.headers['cache-control'],'no-store');assert.match(res.headers['content-security-policy'],/connect-src 'self'/);}
  assert.equal(preview.canServe('/js/synthetic.js?retry=1'),true);
  for(const url of ['/','/p/other/','/js/../page0.html','/js/%2e%2e/page0.html','/preview-site/asset-manifest.json','/js/synthetic.js?other=1','/p/20260803/?retry=1','/js/synthetic.js#fragment'])assert.equal(preview.canServe(url),false,url);
  assert.throws(()=>preview.serve({url:ACCEPTANCE_PAGES[0],method:'POST'},{}));
 }finally{f.dispose();}
});
test('acceptance preview: tampered bytes or unsafe manifest never get served',()=>{
 const f=fixture();try{
  const preview=createAcceptancePreview({origin:ORIGIN,directory:f.dir});fs.appendFileSync(path.join(f.dir,f.files[0].file),'tampered');assert.throws(()=>preview.serve({url:f.files[0].url,method:'GET'},{}),/content mismatch/);
  f.files[0].file='../outside.html';fs.writeFileSync(path.join(f.dir,'asset-manifest.json'),JSON.stringify({files:f.files}));assert.throws(()=>createAcceptancePreview({origin:ORIGIN,directory:f.dir}),/Invalid preview entry/);
 }finally{f.dispose();}
});
