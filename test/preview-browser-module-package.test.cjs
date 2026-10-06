'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {createAcceptancePreview}=require('../src/acceptance-preview.cjs');
const root=path.join(__dirname,'..');
test('Waline browser assets retain ESM scope without changing the server package scope',()=>{
  const scope=JSON.parse(fs.readFileSync(path.join(root,'preview-site/lib/waline/3.15.2/package.json'),'utf8'));
  assert.deepEqual(scope,{private:true,type:'module'});
  const app=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  assert.notEqual(app.type,'module');
});
test('preserved browser-module bytes pass the preview hash gate; the package metadata remains inaccessible',()=>{
  const origin='https://mantou-comments-test-mantous-projects-af7e7067.vercel.app';
  const preview=createAcceptancePreview({origin,directory:path.join(root,'preview-site')});
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'preview-site/asset-manifest.json'),'utf8'));
  const asset=manifest.files.find(x=>/waline\.[a-f0-9]{64}\.js$/.test(x.file));
  const headers={};let body;
  const res={setHeader:(k,v)=>headers[k]=v,end:b=>body=b};
  preview.serve({url:asset.url,method:'GET'},res);
  assert.equal(res.statusCode,200);
  assert.equal(headers['content-type'],'text/javascript; charset=utf-8');
  assert.equal(body.length,asset.bytes);
  assert.equal(createHash('sha256').update(body).digest('hex'),asset.sha256);
  assert.equal(preview.canServe('/lib/waline/3.15.2/package.json'),false);
});
