'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Readable}=require('node:stream');
const {createRequire}=require('node:module');
const {MemoryModel}=require('./memory-model.cjs');
const {createReaderAPI}=require('../src/reader-api.cjs');
const ORIGIN='https://synthetic-reader-fixture.vercel.app';
const POST='/p/synthetic/';const WORK='/works/synthetic/';
class NumericModel extends MemoryModel {
  async add(data){await super.add(data);const row=this.rows.at(-1);row.objectId=String(this.nextId-1);return structuredClone(row);}
}
function fixture(options={}){
  const models={Comment:new NumericModel(),Users:new NumericModel([{objectId:'1',type:'administrator',email:'synthetic@example.invalid'}]),Counter:new NumericModel()};
  let acquisitions=0;
  const handler=createReaderAPI({origin:ORIGIN,expiresAt:Date.now()+3600000,allowedPaths:[POST,WORK],getModels:()=>{acquisitions++;return models;},...options});
  async function call(url,{method='GET',body,raw,headers={}}={}){
    const encoded=raw??(body===undefined?null:JSON.stringify(body));
    const req=Readable.from(encoded===null?[]:[Buffer.from(encoded)]);
    Object.assign(req,{url,method,headers:{host:new URL(ORIGIN).host,...(method==='POST'?{origin:ORIGIN,'content-type':'application/json','content-length':String(Buffer.byteLength(encoded??''))}:{}),...headers}});
    const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(text){this.text=text;}};
    await handler(req,res);return{status:res.statusCode,body:JSON.parse(res.text),headers:res.headers};
  }
  const core=createRequire(require.resolve('@waline/vercel/package.json'))('@waline/core').createWalineCore({models,config:{audit:true,disableRegion:true,disableUserAgent:true},services:{}});
  const create=(extra={})=>call('/api/comment',{method:'POST',body:{nick:'Synthetic reader',comment:'Synthetic root',url:POST,...extra}});
  return{models,core,call,create,acquisitions:()=>acquisitions};
}
test('reader API: real core creates an anonymous waiting root, optional email and no private fields',async()=>{
  const f=fixture();const created=await f.create({mail:'',ua:'SYNTHETIC_UA'});
  assert.equal(created.status,200);assert.equal(created.body.errno,0);assert.equal(created.body.data.status,'waiting');
  assert.equal(f.models.Comment.rows.length,1);assert.equal(f.models.Comment.rows[0].mail,'');
  for(const key of ['ip','ua','user_id'])assert.equal(f.models.Comment.rows[0][key],undefined);
  assert.doesNotMatch(JSON.stringify(created.body),/SYNTHETIC_UA|"mail"|"ip"|"user_id"/);
  const listed=await f.call('/api/comment?url='+encodeURIComponent(POST)+'&page=1&pageSize=5&sortBy=latest');
  assert.equal(listed.status,200);assert.equal(listed.body.data.count,0);assert.deepEqual(listed.body.data.data,[]);
  assert.equal(listed.body.data.page,1);assert.equal(listed.body.data.pageSize,5);
});
test('reader API: approved parent then pending reply becomes visible only after separate approval',async()=>{
  const f=fixture();const root=(await f.create()).body.data;const admin={state:{userInfo:{objectId:'1',type:'administrator'}},headers:{}};
  const reply=()=>f.create({comment:'Synthetic reply',pid:root.objectId,rid:root.objectId});
  assert.equal((await reply()).status,403);assert.equal(f.models.Comment.rows.length,1);
  await f.core.comment.update({objectId:root.objectId,data:{status:'approved'}},admin);
  const added=await reply();assert.equal(added.status,200);assert.equal(added.body.data.status,'waiting');
  let visible=(await f.call('/api/comment?url='+encodeURIComponent(POST))).body.data;
  assert.equal(visible.count,1);assert.deepEqual(visible.data[0].children,[]);
  await f.core.comment.update({objectId:added.body.data.objectId,data:{status:'approved'}},admin);
  visible=(await f.call('/api/comment?url='+encodeURIComponent(POST))).body.data;
  assert.equal(visible.count,2);assert.equal(visible.data[0].children[0].objectId,added.body.data.objectId);
});
test('reader API: actual model counter values are read without reaction writes or cross-page mixing',async()=>{
  const f=fixture();await f.models.Counter.add({url:POST,reaction0:7});
  const count=await f.call('/api/article?path='+encodeURIComponent(POST)+'&type=reaction0');
  assert.equal(count.status,200);assert.deepEqual(count.body.data,[{reaction0:7}]);
  assert.deepEqual((await f.call('/api/article?path='+encodeURIComponent(WORK)+'&type=reaction0')).body.data,[{reaction0:0}]);
  assert.equal((await f.call('/api/article',{method:'POST',body:{path:POST,type:'reaction0',action:'inc'}})).status,405);
  assert.equal(f.models.Counter.rows[0].reaction0,7);
});
test('reader API: caller privileges, bearer tokens, cross-origin and unrelated endpoints remain closed',async()=>{
  const f=fixture();
  assert.equal((await f.create({status:'approved',user_id:'1'})).status,400);
  assert.equal((await f.call('/api/comment',{method:'POST',body:{nick:'Synthetic',comment:'text',url:POST},headers:{authorization:'Bearer SYNTHETIC_ONLY'}})).status,403);
  assert.equal((await f.call('/api/comment',{method:'POST',body:{nick:'Synthetic',comment:'text',url:POST},headers:{origin:'https://evil.invalid'}})).status,403);
  for(const path of ['/api/user','/api/oauth','/api/comment?method=put','/api/%63omment'])assert.ok((await f.call(path)).status>=400);
  assert.equal(f.models.Comment.rows.length,0);assert.equal(f.acquisitions(),0);
});
test('reader API: real editor HTML is returned as escaped plain text without active markup',async()=>{
  const f=fixture();const result=await f.create({comment:'<img src=https://synthetic.invalid onerror=alert(1)>\n<script>synthetic()</script>'});
  assert.equal(result.status,200);assert.match(result.body.data.comment,/&lt;img/);assert.match(result.body.data.comment,/<br>/);assert.doesNotMatch(result.body.data.comment,/<img|<script>/);
});
test('reader API: duplicate JSON keys, framing, invalid mail and excessive input stop before storage',async()=>{
  const f=fixture();
  assert.equal((await f.call('/api/comment',{method:'POST',raw:'{"nick":"a","\\u006eick":"b","comment":"x","url":"'+POST+'"}'})).status,400);
  assert.equal((await f.call('/api/comment',{method:'POST',body:{nick:'a',comment:'x',url:POST},headers:{'content-length':'1'}})).status,400);
  assert.equal((await f.create({mail:'invalid'})).status,400);
  assert.equal((await f.create({comment:'x'.repeat(1001)})).status,400);
  assert.equal((await f.create({url:'/p/not-allowed/'})).status,400);
  assert.equal(f.models.Comment.rows.length,0);assert.equal(f.acquisitions(),0);
});
test('reader API: cross-thread, missing parent and forged reply root cannot create a row',async()=>{
  const f=fixture();const parent=await f.models.Comment.add({url:WORK,status:'approved',comment:'Synthetic work parent'});
  assert.equal((await f.create({pid:parent.objectId,rid:parent.objectId})).status,403);
  assert.equal((await f.create({pid:'99',rid:'99'})).status,404);
  parent.url=POST;f.models.Comment.rows[0].url=POST;
  assert.equal((await f.create({pid:parent.objectId,rid:'99'})).status,400);
  assert.equal(f.models.Comment.rows.length,1);
});
test('reader API: bounded acceptance rejects a third comment and unknown writes are never retried',async()=>{
  const f=fixture();assert.equal((await f.create()).status,200);assert.equal((await f.create({comment:'Synthetic second'})).status,200);assert.equal((await f.create({comment:'Synthetic third'})).status,409);
  assert.equal(f.models.Comment.rows.length,2);
  const g=fixture();let writes=0;const add=g.models.Comment.add.bind(g.models.Comment);
  g.models.Comment.add=async(...args)=>{writes++;await add(...args);throw Error('SYNTHETIC_DATABASE_DETAIL');};
  const result=await g.create();assert.equal(result.status,503);assert.match(result.body.errmsg,/Do not resubmit/);assert.doesNotMatch(JSON.stringify(result.body),/SYNTHETIC_DATABASE_DETAIL/);assert.equal(writes,1);
});
test('reader API: absolute expiry prevents metadata acquisition and input reads',async t=>{
  const now=Date.now();t.mock.timers.enable({apis:['Date'],now});const f=fixture({expiresAt:now+1000});t.mock.timers.setTime(now+1001);
  assert.equal((await f.create()).status,403);assert.equal(f.acquisitions(),0);assert.equal(f.models.Comment.rows.length,0);
});
test('reader API: mounted Waline client order names load approved comments and reject arbitrary orders',async()=>{
  const f=fixture();const row=(await f.create()).body.data;await f.core.comment.update({objectId:row.objectId,data:{status:'approved'}},{state:{userInfo:{objectId:'1',type:'administrator'}},headers:{}});
  for(const sortBy of ['latest','oldest','hottest','insertedAt_desc','insertedAt_asc','like_desc']){
    const result=await f.call('/api/comment?path='+encodeURIComponent(POST)+'&pageSize=5&page=1&lang=en-US&sortBy='+sortBy);assert.equal(result.status,200,sortBy);assert.equal(result.body.data.data[0].objectId,row.objectId);
  }
  for(const sortBy of ['__proto__','constructor','unknown','status_desc'])assert.equal((await f.call('/api/comment?path='+encodeURIComponent(POST)+'&sortBy='+sortBy)).status,400,sortBy);
});
test('reader API: actual editor reply metadata and numeric PostgreSQL IDs preserve waiting status',async()=>{
  const f=fixture();const parent=(await f.create()).body.data;await f.core.comment.update({objectId:parent.objectId,data:{status:'approved'}},{state:{userInfo:{objectId:'1',type:'administrator'}},headers:{}});
  const reply=await f.create({comment:'Synthetic reply',pid:Number(parent.objectId),rid:Number(parent.objectId),at:'Untrusted mention'});
  assert.equal(reply.status,200);assert.equal(reply.body.data.status,'waiting');assert.equal(f.models.Comment.rows[1].pid,parent.objectId);assert.equal(f.models.Comment.rows[1].rid,parent.objectId);assert.equal(f.models.Comment.rows[1].at,undefined);assert.equal(f.models.Comment.rows[1].comment,'Synthetic reply');
  const invalid=fixture();for(const value of [0,-1,1.5,2147483648])assert.equal((await invalid.create({pid:value,rid:value,at:'Synthetic'})).status,400);assert.equal(invalid.models.Comment.rows.length,0);
});
