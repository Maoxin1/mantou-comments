'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{Readable}=require('node:stream');
const {createPublicReaderAPI}=require('../src/reader-api.cjs');
const {MemoryModel}=require('./memory-model.cjs');
const ORIGIN='https://comments.synthetic.invalid',BLOG='https://blog.synthetic.invalid',POST='/p/synthetic/',WORK='/works/synthetic/';
class NumericModel extends MemoryModel{async add(data){await super.add(data);this.rows.at(-1).objectId=String(this.nextId-1);return structuredClone(this.rows.at(-1));}}
function fixture(){
 const models={Comment:new NumericModel(),Users:new NumericModel(),Counter:new NumericModel()};let acquisitions=0;
 const handler=createPublicReaderAPI({origin:ORIGIN,blogOrigin:BLOG,allowedPaths:[POST,WORK],getModels:()=>{acquisitions++;return models;}});
 async function call(url,{method='GET',body,headers={}}={}){
  const data=body===undefined?'':JSON.stringify(body),req=Readable.from(data?[Buffer.from(data)]:[]);
  Object.assign(req,{url,method,headers:{host:new URL(ORIGIN).host,origin:BLOG,'sec-fetch-site':'cross-site',...(method==='POST'?{'content-type':'application/json','content-length':String(Buffer.byteLength(data))}:{}),...headers}});
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(text){this.text=text;}};await handler(req,res);return{status:res.statusCode,headers:res.headers,body:res.text?JSON.parse(res.text):null};
 }
 return{models,call,acquisitions:()=>acquisitions,create:(extra={})=>call('/api/comment?lang=en-US',{method:'POST',body:{nick:'Synthetic',comment:'Synthetic comment',url:POST,...extra}})};
}
test('public reader: exact cross-origin preflight works without database access or credentials',async()=>{
 const f=fixture();for(const [method,url]of [['POST','/api/comment?lang=en-US'],['GET','/api/comment?path=%2Fp%2Fsynthetic%2F&page=1']]){
  const r=await f.call(url,{method:'OPTIONS',headers:{'access-control-request-method':method,'access-control-request-headers':'content-type'}});
  assert.equal(r.status,204);assert.equal(r.headers['access-control-allow-origin'],BLOG);assert.equal(r.headers.vary,'Origin');assert.equal(r.headers['access-control-allow-credentials'],undefined);
 }assert.equal(f.acquisitions(),0);
});
test('public reader: foreign/null origins, credential headers and unsafe preflights fail before data access',async()=>{
 const f=fixture();for(const origin of ['https://evil.invalid','null',BLOG+'.evil.invalid',ORIGIN]){
  const r=await f.call('/api/comment?url='+POST,{headers:{origin}});assert.equal(r.status,403);assert.equal(r.headers['access-control-allow-origin'],undefined);
 }
 for(const headers of [{'access-control-request-method':'DELETE'},{'access-control-request-method':'POST','access-control-request-headers':'authorization'},{'access-control-request-method':'POST',origin:undefined}])assert.equal((await f.call('/api/comment',{method:'OPTIONS',headers})).status,403);
 assert.equal((await f.call('/api/comment',{headers:{authorization:'SYNTHETIC_ONLY'}})).status,403);
 assert.equal((await f.call('/api/comment?url='+POST,{headers:{host:'evil.invalid'}})).status,403);
 assert.equal((await f.call('/api/comment?method=put',{method:'OPTIONS',headers:{'access-control-request-method':'POST'}})).status,403);
 assert.equal(f.acquisitions(),0);
});
test('public reader: no acceptance expiry or two-comment cap; all guest writes still await approval',async t=>{
 const now=Date.now();t.mock.timers.enable({apis:['Date'],now});const f=fixture();t.mock.timers.setTime(now+7*86400000);
 for(let i=0;i<5;i++){const r=await f.create({comment:'Synthetic unique '+i,mail:i===0?'optional@example.invalid':''});assert.equal(r.status,200);assert.equal(r.body.data.status,'waiting');assert.equal(r.headers['access-control-allow-origin'],BLOG);assert.doesNotMatch(JSON.stringify(r.body),/optional@example|"mail"|"ip"|"ua"|user_id/);}
 assert.equal(f.models.Comment.rows.length,5);assert.equal(f.models.Counter.rows.length,0);assert.equal(f.models.Users.rows.length,0);
 const listed=await f.call('/api/comment?url='+POST,{headers:{origin:undefined}});assert.equal(listed.status,200);assert.equal(listed.body.data.count,0);assert.equal(listed.headers['access-control-allow-origin'],undefined);
});
test('public reader: approved parent and reply share the canonical thread, pending reply stays hidden',async()=>{
 const f=fixture();const root=await f.create();const id=root.body.data.objectId;
 assert.equal((await f.create({pid:id,rid:id,comment:'Synthetic reply'})).status,403);
 await f.models.Comment.update({status:'approved'},{objectId:id});
 const reply=await f.create({pid:id,rid:id,comment:'Synthetic reply'});assert.equal(reply.status,200);assert.equal(reply.body.data.status,'waiting');
 let r=await f.call('/api/comment?url='+POST);assert.equal(r.body.data.count,1);assert.deepEqual(r.body.data.data[0].children,[]);
 await f.models.Comment.update({status:'approved'},{objectId:reply.body.data.objectId});r=await f.call('/api/comment?path='+POST+'&lang=en-US');assert.equal(r.body.data.count,2);assert.equal(r.body.data.data[0].children[0].objectId,reply.body.data.objectId);
 assert.equal((await f.call('/api/comment?url='+WORK)).body.data.count,0);
});
test('public reader: unknown threads, privilege injection, account and reaction routes stay closed',async()=>{
 const f=fixture();assert.equal((await f.create({url:'/en'+POST})).status,400);assert.equal((await f.create({url:'/p/unknown/'})).status,400);assert.equal((await f.create({status:'approved'})).status,400);
 for(const route of ['/api/user','/api/oauth','/api/article?path='+POST+'&type=reaction0','/__private/setup'])assert.equal((await f.call(route)).status,404);
 assert.equal(f.models.Comment.rows.length,0);assert.equal(f.acquisitions(),0);
});
test('public reader: a potentially committed write is attempted once and returns a sanitized unknown result',async()=>{
 const f=fixture();let writes=0;const add=f.models.Comment.add.bind(f.models.Comment);f.models.Comment.add=async(...args)=>{writes++;await add(...args);throw Error('SYNTHETIC_PRIVATE_DETAIL');};
 const r=await f.create();assert.equal(r.status,503);assert.match(r.body.errmsg,/Do not resubmit/);assert.doesNotMatch(JSON.stringify(r.body),/SYNTHETIC_PRIVATE_DETAIL/);assert.equal(writes,1);assert.equal(f.models.Comment.rows.length,1);
});
test('public reader: invalid registry and HTTPS origin configuration fail closed',()=>{
 const good={origin:ORIGIN,blogOrigin:BLOG,allowedPaths:[POST],getModels:()=>{}};
 for(const change of [{origin:'http://comments.invalid'},{blogOrigin:'*'},{blogOrigin:ORIGIN},{allowedPaths:[POST,POST]},{allowedPaths:['/en'+POST]},{allowedPaths:['/p/../']},{allowedPaths:[]}])assert.throws(()=>createPublicReaderAPI({...good,...change}),TypeError);
});
