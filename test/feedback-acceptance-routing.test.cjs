'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {Readable}=require('node:stream');
const fixture=require('./fixtures/feedback-acceptance-routing.json');
const {createAcceptancePreview}=require('../src/acceptance-preview.cjs');
const {createStagedFeedbackAcceptance}=require('../deployment/staged-feedback-acceptance.cjs');
const root=path.join(__dirname,'..');
const profile=fs.readFileSync(path.join(root,'vercel.feedback-acceptance.json'));
const assets=JSON.parse(fs.readFileSync(path.join(root,'preview-site/asset-manifest.json'),'utf8'));
const HOST='mantou-comments-synthetic-mantous-projects-af7e7067.vercel.app';
const ORIGIN='https://'+HOST;
function forwardedURL(url,routes){
  for(const route of routes){
    if(!route.src||!route.dest)continue;
    const match=new RegExp(route.src).exec(url);
    if(!match)continue;
    const destination=route.dest.replace(/\$(\d+)/g,(_,n)=>match[Number(n)]??'');
    return url+new URL(destination,ORIGIN).search;
  }
  throw new Error('No normalized route');
}
test('routing: official wildcard conversion reproduces strict-preview rejection for all four asset families',()=>{
  const preview=createAcceptancePreview({origin:ORIGIN,directory:path.join(root,'preview-site')});
  for(const family of ['css','js','lib','images']){
    const asset=assets.files.find(f=>f.url.startsWith('/'+family+'/'));
    assert.ok(asset);
    const forwarded=forwardedURL(asset.url,fixture.previousWildcardRoutes);
    assert.match(forwarded,/\?path=/);
    assert.equal(preview.canServe(asset.url),true);
    assert.equal(preview.canServe(forwarded),false);
  }
});
test('routing: pinned normalized fixture matches config; known assets have no generated query parameters',()=>{
  assert.equal(fixture.cliVersion,'62.2.0');
  assert.equal(createHash('sha256').update(profile).digest('hex'),fixture.profileSHA256);
  for(const asset of assets.files)assert.equal(forwardedURL(asset.url,fixture.fixedRoutes),asset.url);
  const config=JSON.parse(profile);
  assert.equal(config.rewrites.filter(r=>r.source.includes(':')&&r.destination!=='/api/disabled').length,0);
  assert.equal(config.rewrites.at(-1).destination,'/api/disabled');
});
test('routing: all 35 real Hugo resources pass through normalized routes, hashes and guarded handler without model reads',async()=>{
  let modelReads=0;
  const env={VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_NtBPfOSSwqaOLH0tejtx7Da5eE9Q',VERCEL_URL:HOST,NODEJS_HELPERS:'0',PRIVATE_ADMIN_ENABLED:'true',PRIVATE_ADMIN_EXPIRES_AT:new Date(Math.floor((Date.now()+3600000)/1000)*1000).toISOString(),PRIVATE_ADMIN_EMAIL:'synthetic@example.invalid',PRIVATE_ADMIN_DISPLAY_NAME:'Synthetic',PRIVATE_ADMIN_ACCESS_KEY:'A'.repeat(64),JWT_TOKEN:'B'.repeat(64)};
  const handler=createStagedFeedbackAcceptance(env,{logEvent(){},createAdapter:()=>({getModels(){modelReads++;throw new Error('No storage during resource test');}}),createPreview:()=>createAcceptancePreview({origin:ORIGIN,directory:path.join(root,'preview-site')})});
  for(const asset of assets.files){
    const req=Readable.from([]);Object.assign(req,{method:'GET',url:forwardedURL(asset.url,fixture.fixedRoutes),headers:{host:HOST}});
    const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(data){this.data=data;this.writableEnded=true;}};
    await handler(req,res);assert.equal(res.statusCode,200,asset.url);
    if(asset.file.endsWith('.js'))assert.match(res.headers['content-type'],/^text\/javascript/);
  }
  assert.equal(modelReads,0);
});
test('routing: correction keeps unexpected query keys and unknown assets closed',()=>{
  const preview=createAcceptancePreview({origin:ORIGIN,directory:path.join(root,'preview-site')});
  const asset=assets.files.find(f=>f.url.startsWith('/js/'));
  for(const suffix of ['?path=x','?token=x','?retry=1&path=x'])assert.equal(preview.canServe(asset.url+suffix),false);
  assert.equal(preview.canServe('/js/unknown.js'),false);
  assert.equal(preview.canServe('/js/../api/comment'),false);
  assert.equal(preview.canServe('/__private/setup'),false);
});

