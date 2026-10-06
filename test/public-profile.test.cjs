'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{Readable}=require('node:stream');
const {createPublicComments}=require('../deployment/public-comments.cjs');
const {MemoryModel}=require('./memory-model.cjs');
const paths=require('../config/published-threads.json').paths;
const HOST='mantou-comments-synthetic-mantous-projects-af7e7067.vercel.app';
function fixture(overrides={}){
 const env={VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_NtBPfOSSwqaOLH0tejtx7Da5eE9Q',NODEJS_HELPERS:'0',PUBLIC_COMMENTS_ENABLED:'true',VERCEL_URL:HOST,PRIVATE_ADMIN_ENABLED:'true',PRIVATE_ADMIN_EXPIRES_AT:new Date(Date.now()+3600000).toISOString().replace(/\.\d{3}Z$/,'Z'),PRIVATE_ADMIN_ACCESS_KEY:'A'.repeat(64),JWT_TOKEN:'B'.repeat(64),PRIVATE_ADMIN_EMAIL:'synthetic@example.invalid',PRIVATE_ADMIN_DISPLAY_NAME:'Synthetic',...overrides};
 const models={Comment:new MemoryModel(),Users:new MemoryModel(),Counter:new MemoryModel()};let acquisitions=0;
 const handler=createPublicComments(env,{createAdapter:()=>({getModels:()=>{acquisitions++;return models;}})});
 async function call(url,host=HOST){const req=Readable.from([]);Object.assign(req,{url,method:'GET',headers:{host}});const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(s){this.text=s;}};await handler(req,res);return res;}
 return{call,env,models,acquisitions:()=>acquisitions};
}
test('release profile: disabled by default, exact project and host are mandatory',async()=>{
 for(const override of [{PUBLIC_COMMENTS_ENABLED:undefined},{PUBLIC_COMMENTS_ENABLED:'false'},{VERCEL_ENV:'preview'},{VERCEL_PROJECT_ID:'wrong'},{NODEJS_HELPERS:'1'}]){const f=fixture(override);assert.equal((await f.call('/api/comment?url='+paths[0])).statusCode,503);assert.equal(f.acquisitions(),0);}
 const f=fixture();for(const host of ['evil.invalid','mantou-comments-other-mantous-projects-af7e7067.vercel.app'])assert.equal((await f.call('/api/comment?url='+paths[0],host)).statusCode,503);
 for(const host of ['mantou-comments.vercel.app','mantou-comments-mantous-projects-af7e7067.vercel.app'])assert.equal((await f.call('/api/comment?url='+paths[0],host)).statusCode,200);
});
test('release profile: administrator expiry never stops public reads; private host remains protected',async t=>{
 const now=Date.now();t.mock.timers.enable({apis:['Date'],now});const f=fixture();
 assert.equal((await f.call('/__private/access')).statusCode,200);
 assert.equal((await f.call('/__private/access','mantou-comments.vercel.app')).statusCode,503);
 t.mock.timers.setTime(now+7200000);assert.equal((await f.call('/__private/access')).statusCode,403);
 assert.equal((await f.call('/api/comment?url='+paths[0],'mantou-comments.vercel.app')).statusCode,200);
});
test('release profile: public reads do not need admin credentials, configuration or a new administrator',async()=>{
 const f=fixture({PRIVATE_ADMIN_ENABLED:'false',PRIVATE_ADMIN_EXPIRES_AT:'invalid',PRIVATE_ADMIN_ACCESS_KEY:undefined,JWT_TOKEN:undefined});
 assert.equal((await f.call('/api/comment?url='+paths[0])).statusCode,200);assert.equal((await f.call('/__private/access')).statusCode,403);assert.equal(f.models.Users.rows.length,0);
});
test('release profile: setup, alternate APIs and internal function path are not public routes',async()=>{
 const f=fixture();for(const p of ['/__private/setup','/api/public-comments','/api/article','/api/user','/api/oauth','//evil.invalid'])assert.equal((await f.call(p)).statusCode,503,p);assert.equal(f.acquisitions(),0);
});
test('release registry: all published thread identifiers are canonical, unique and cover articles and works',()=>{
 assert.ok(paths.length>8);assert.equal(new Set(paths).size,paths.length);assert.ok(paths.some(p=>p.startsWith('/p/')));assert.ok(paths.some(p=>p.startsWith('/works/')));for(const p of paths)assert.match(p,/^\/(?:p|works)\/[A-Za-z0-9_-]+\/$/);
});
