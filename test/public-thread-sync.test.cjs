'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{Readable}=require('node:stream');
const {createPublicComments}=require('../deployment/public-comments.cjs');
const {createPublicReaderAPI}=require('../src/reader-api.cjs');
const {MemoryModel}=require('./memory-model.cjs');
class NumericModel extends MemoryModel{async add(data){await super.add(data);this.rows.at(-1).objectId=String(this.nextId-1);return structuredClone(this.rows.at(-1));}}
const {VERSION_URL}=require('../src/published-thread-registry.cjs');
const paths=require('../config/published-threads.json').paths;
const NEW='/p/auto-sync-synthetic/',HOST='mantou-comments.vercel.app',BLOG='https://mantou-blog.pages.dev',SHA='a'.repeat(40);
function fixture(){
 const env={VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_NtBPfOSSwqaOLH0tejtx7Da5eE9Q',NODEJS_HELPERS:'0',PUBLIC_COMMENTS_ENABLED:'true',VERCEL_URL:'mantou-comments-synthetic-mantous-projects-af7e7067.vercel.app'};
 const models={Comment:new NumericModel(),Users:new NumericModel(),Counter:new NumericModel()};let acquired=0,fetches=0;
 const handler=createPublicComments(env,{createAdapter:()=>({getModels:()=>{acquired++;return models;}}),fetchManifest:async url=>{fetches++;const r=new Response(JSON.stringify(url===VERSION_URL?{commit_sha:SHA,deploy_branch:'main',run_id:'1',run_attempt:'1'}:{version:1,sourceCommit:SHA,paths:[paths[0],NEW]}),{headers:{'content-type':'application/json'}});Object.defineProperty(r,'url',{value:url});return r;}});
 const call=async(path,{method='GET',body,headers={}}={})=>{const bytes=body?Buffer.from(JSON.stringify(body)):Buffer.alloc(0),req=Readable.from(bytes.length?[bytes]:[]);Object.assign(req,{url:path,method,headers:{host:HOST,origin:BLOG,...(method==='POST'?{'content-type':'application/json','content-length':String(bytes.length)}:{}),...headers}});const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(text){this.text=text;}};await handler(req,res);return{status:res.statusCode,headers:res.headers,body:res.text?JSON.parse(res.text):null};};
 return{call,models,fetches:()=>fetches,acquired:()=>acquired};
}
test('public sync: a newly published identifier supports guest waiting comments without a backend restart',async()=>{
 const f=fixture();assert.ok(!paths.includes(NEW));const read=await f.call('/api/comment?path='+NEW);assert.equal(read.status,200);assert.equal(read.headers['x-discussion-registry-version'],SHA);const result=await f.call('/api/comment',{method:'POST',body:{nick:'Synthetic',comment:'Synthetic automatic discussion',mail:'',url:NEW}});assert.equal(result.status,200);assert.equal(result.body.data.status,'waiting');assert.equal(f.models.Comment.rows.length,1);assert.equal((await f.call('/api/comment?path='+NEW)).body.data.count,0);assert.equal(f.fetches(),2);assert.equal(f.models.Users.rows.length,0);assert.equal(f.models.Counter.rows.length,0);
});
test('public sync: only the trusted blog may read the public registry version through CORS',async()=>{
 const f=fixture();
 const read=await f.call('/api/comment?path='+NEW);
 assert.equal(read.status,200);assert.equal(read.headers['access-control-allow-origin'],BLOG);
 assert.equal(read.headers['access-control-expose-headers'],'x-discussion-registry-version');
 assert.equal(read.headers['access-control-allow-credentials'],undefined);
 const denied=await f.call('/api/comment?path='+NEW,{headers:{origin:'https://evil.invalid'}});
 assert.equal(denied.status,403);assert.equal(denied.headers['access-control-expose-headers'],undefined);
 assert.equal(denied.headers['x-discussion-registry-version'],undefined);
});
test('public sync: origin, preflight, malformed paths and forbidden routes are checked before registry or database access',async()=>{
 const f=fixture();assert.equal((await f.call('/api/comment?path='+NEW,{headers:{origin:'https://evil.invalid'}})).status,403);assert.equal((await f.call('/api/comment',{method:'OPTIONS',headers:{'access-control-request-method':'GET'}})).status,204);assert.equal((await f.call('/api/comment?path=/en'+NEW)).status,400);assert.equal((await f.call('/api/user')).status,503);assert.equal(f.fetches(),0);assert.equal(f.acquired(),0);
});
test('public sync: unknown canonical paths never obtain models, and resolver failures cannot attempt writes',async()=>{
 const f=fixture();assert.equal((await f.call('/api/comment?path=/p/never-published/')).status,400);assert.equal(f.acquired(),0);
 let acquired=0;const handler=createPublicReaderAPI({origin:'https://'+HOST,blogOrigin:BLOG,allowedPaths:[paths[0]],isThreadAllowed:async()=>{throw Error('SYNTHETIC_PRIVATE_ERROR');},getModels:()=>{acquired++;return f.models;}});
 const data=Buffer.from(JSON.stringify({nick:'Synthetic',comment:'Synthetic',url:NEW})),req=Readable.from([data]);Object.assign(req,{url:'/api/comment',method:'POST',headers:{host:HOST,origin:BLOG,'content-type':'application/json','content-length':String(data.length)}});const res={setHeader(){},end(text){this.text=text;}};await handler(req,res);assert.equal(res.statusCode,503);assert.equal(acquired,0);assert.doesNotMatch(res.text,/SYNTHETIC_PRIVATE_ERROR|result is unknown/);assert.equal(f.models.Comment.rows.length,0);
});
