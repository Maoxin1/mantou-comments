'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Readable}=require('node:stream');
const {PasswordHash}=require('phpass');
const {MemoryModel}=require('./memory-model.cjs');
const {createStagedFeedbackAcceptance,ACCEPTANCE_PATHS}=require('../deployment/staged-feedback-acceptance.cjs');
const HOST='mantou-comments-synthetic-mantous-projects-af7e7067.vercel.app';
const ORIGIN='https://'+HOST;const KEY='A'.repeat(64);const PASSWORD='Synthetic-password-123';
const field=html=>html.match(/name="csrf" value="([^"]+)"/)?.[1];
const cookie=(r,name)=>(r.headers['set-cookie']||[]).find(x=>x.startsWith(name+'='))?.split(';')[0];
class NumericModel extends MemoryModel{async add(data){await super.add(data);this.rows.at(-1).objectId=String(this.nextId-1);return structuredClone(this.rows.at(-1));}}
async function fixture(delta={}){
  const models={Users:new NumericModel([{objectId:'1',email:'synthetic@example.invalid',type:'administrator',display_name:'Synthetic',password:await new PasswordHash().hashPasswordAsync(PASSWORD)}]),Comment:new NumericModel(),Counter:new NumericModel()};
  let acquired=0;const events=[];
  const env={VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_NtBPfOSSwqaOLH0tejtx7Da5eE9Q',VERCEL_URL:HOST,NODEJS_HELPERS:'0',PRIVATE_ADMIN_ENABLED:'true',PRIVATE_ADMIN_EXPIRES_AT:new Date(Math.floor((Date.now()+3600000)/1000)*1000).toISOString(),PRIVATE_ADMIN_EMAIL:'synthetic@example.invalid',PRIVATE_ADMIN_DISPLAY_NAME:'Synthetic',PRIVATE_ADMIN_ACCESS_KEY:KEY,JWT_TOKEN:'B'.repeat(64),...delta};
  const handler=createStagedFeedbackAcceptance(env,{logEvent:event=>events.push(structuredClone(event)),createAdapter:()=>({getModels:()=>{acquired++;return models;},acquireBootstrap:()=>{throw Error('SYNTHETIC_BOOTSTRAP_FORBIDDEN');}}),createPreview:()=>({canServe:url=>url==='/p/20260803/',serve(req,res){res.statusCode=200;res.end('Synthetic preview');}})});
  async function call(url,{session,form,json,headers={}}={}){
    const data=form?new URLSearchParams(form).toString():(json?JSON.stringify(json):null);
    const req=Readable.from(data===null?[]:[Buffer.from(data)]);
    Object.assign(req,{url,method:data===null?'GET':'POST',headers:{host:HOST,...(session?{cookie:session}:{}),...(data===null?{}:{origin:ORIGIN,'content-type':form?'application/x-www-form-urlencoded':'application/json','content-length':String(Buffer.byteLength(data))}),...headers}});
    const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(text){this.text=text;this.writableEnded=true;}};
    await handler(req,res);return res;
  }
  return{models,env,call,events,acquired:()=>acquired};
}
test('acceptance profile: joins real reader core and approved administrator core without bootstrap',async()=>{
  const f=await fixture();const path=ACCEPTANCE_PATHS[0];
  const created=await f.call('/api/comment',{json:{nick:'Synthetic reader',comment:'Synthetic pending',url:path,mail:''}});
  assert.equal(created.statusCode,200);const root=JSON.parse(created.text).data;assert.equal(root.status,'waiting');
  const owner=cookie(await f.call('/__private/access',{form:{ownerAccessKey:KEY}}),'__Host-mantou-owner');
  const loginForm=await f.call('/__private/login',{session:owner});
  const login=await f.call('/__private/login',{session:owner,form:{csrf:field(loginForm.text),password:PASSWORD}});
  assert.equal(login.statusCode,303);const session=owner+'; '+cookie(login,'__Host-mantou-admin');
  const home=await f.call('/__private',{session});assert.equal(home.statusCode,200);assert.match(home.text,/Approve comment/);
  const approved=await f.call('/__private',{session,form:{csrf:field(home.text),objectId:root.objectId}});assert.equal(approved.statusCode,303);
  const visible=await f.call('/api/comment?url='+encodeURIComponent(path)+'&sortBy=latest',{session});assert.equal(visible.statusCode,200);assert.equal(JSON.parse(visible.text).data.count,1);
  const reply=await f.call('/api/comment',{session,json:{nick:'Synthetic replier',comment:'Synthetic reply',url:path,pid:root.objectId,rid:root.objectId}});
  assert.equal(reply.statusCode,200);assert.equal(JSON.parse(reply.text).data.status,'waiting','Administrator browser must still be a guest on reader routes');
  assert.equal(f.models.Users.rows.length,1);assert.equal(f.models.Counter.rows.length,0);
  assert.equal(f.events.length,1);assert.deepEqual(f.events[0],{event:'mantou_feedback_acceptance',version:1,phase:'configuration',outcome:'ready',allowedThreads:2,commentsPerThread:2,moderationEnabled:true,readerIsGuest:true,outboundServices:0});
});
test('acceptance profile: formal aliases, wrong project and helpers fail before metadata',async()=>{
  for(const delta of [{VERCEL_URL:'mantou-comments.vercel.app'},{VERCEL_PROJECT_ID:'wrong'},{NODEJS_HELPERS:'1'},{PRIVATE_ADMIN_ENABLED:'false'},{VERCEL_ENV:'preview'}]){
    const f=await fixture(delta);const response=await f.call('/api/comment?url='+encodeURIComponent(ACCEPTANCE_PATHS[0]));assert.equal(response.statusCode,503);assert.equal(f.acquired(),0);
  }
});
test('acceptance profile: retired or malformed windows and unknown routes fail closed',async()=>{
  const expired=await fixture({PRIVATE_ADMIN_EXPIRES_AT:new Date(Math.floor((Date.now()-10000)/1000)*1000).toISOString()});
  assert.equal((await expired.call('/api/comment?url='+encodeURIComponent(ACCEPTANCE_PATHS[0]))).statusCode,403);assert.equal(expired.acquired(),0);
  const malformed=await fixture({PRIVATE_ADMIN_EXPIRES_AT:'not-a-date'});assert.equal((await malformed.call('/__private/access')).statusCode,503);
  const normal=await fixture();for(const path of ['/api/user','/api/feedback-acceptance','/__private/signup','/__private/setup','/api/%63omment'])assert.equal((await normal.call(path)).statusCode,503);
  assert.equal(normal.acquired(),0);
});
test('acceptance profile: bad owner/signing configuration never exposes a reader writer',async()=>{
  const f=await fixture({JWT_TOKEN:KEY});const response=await f.call('/api/comment',{json:{nick:'Synthetic',comment:'Synthetic',url:ACCEPTANCE_PATHS[0]}});
  assert.equal(response.statusCode,503);assert.equal(f.acquired(),0);assert.equal(f.models.Comment.rows.length,0);
});
test('acceptance profile: preview files use the same project and deadline gates before models',async()=>{
  const f=await fixture();assert.equal((await f.call('/p/20260803/')).statusCode,200);assert.equal(f.acquired(),0);
  for(const route of ['/p/other/','/images/not-allowed.png','/preview-site/p/20260803/index.html'])assert.equal((await f.call(route)).statusCode,503);
  const expired=await fixture({PRIVATE_ADMIN_EXPIRES_AT:new Date(Math.floor((Date.now()-10000)/1000)*1000).toISOString()});assert.equal((await expired.call('/p/20260803/')).statusCode,403);assert.equal(expired.acquired(),0);
  const bad=await fixture({JWT_TOKEN:KEY});assert.equal((await bad.call('/p/20260803/')).statusCode,503);assert.equal(bad.acquired(),0);
});
test('acceptance profile: short secrets and out-of-thread approvals stop before any write',async()=>{
  const short=await fixture({PRIVATE_ADMIN_ACCESS_KEY:'A'.repeat(43)});assert.equal((await short.call('/api/comment',{json:{nick:'Synthetic',comment:'Synthetic',url:ACCEPTANCE_PATHS[0]}})).statusCode,503);assert.equal(short.acquired(),0);
  const f=await fixture();const outside=await f.models.Comment.add({nick:'Synthetic',comment:'Outside scope',url:'/p/outside/',status:'waiting'});
  const owner=cookie(await f.call('/__private/access',{form:{ownerAccessKey:KEY}}),'__Host-mantou-owner');const loginForm=await f.call('/__private/login',{session:owner});const login=await f.call('/__private/login',{session:owner,form:{csrf:field(loginForm.text),password:PASSWORD}});const session=owner+'; '+cookie(login,'__Host-mantou-admin');
  assert.equal((await f.call('/__private',{session})).statusCode,503);f.models.Comment.rows=[];const validHome=await f.call('/__private',{session});f.models.Comment.rows=[outside];
  assert.equal((await f.call('/__private',{session,form:{csrf:field(validHome.text),objectId:outside.objectId}})).statusCode,403);assert.equal(f.models.Comment.rows[0].status,'waiting');assert.equal(f.models.Users.rows.length,1);
});
