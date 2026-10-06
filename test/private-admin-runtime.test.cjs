'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const environment=()=>({VERCEL_ENV:'production',NODEJS_HELPERS:'0',VERCEL_PROJECT_ID:'prj_NtBPfOSSwqaOLH0tejtx7Da5eE9Q',VERCEL_URL:'mantou-comments-synthetic-mantous-projects-af7e7067.vercel.app',PRIVATE_ADMIN_ENABLED:'true',PRIVATE_ADMIN_EMAIL:'owner@example.invalid',PRIVATE_ADMIN_DISPLAY_NAME:'Fixture Owner',PRIVATE_ADMIN_ACCESS_KEY:'fixture-owner-key-not-a-real-secret-00000000000000',JWT_TOKEN:'fixture-signing-key-not-a-real-secret-11111111111111',PRIVATE_ADMIN_EXPIRES_AT:'2099-01-01T00:00:00Z'});
function response(){return{statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=v;}};}
function make(env=environment(),deps={}){return require('../deployment/staged-private-admin.cjs').createStagedPrivateAdmin(env,deps);}
test('private runtime: generated host, exact project and explicit opt-in are required before creating an adapter',async()=>{
 for(const delta of [{NODEJS_HELPERS:'1'},{NODEJS_HELPERS:undefined},{VERCEL_ENV:'preview'},{VERCEL_PROJECT_ID:'other'},{VERCEL_URL:'mantou-comments.vercel.app'},{PRIVATE_ADMIN_ENABLED:''}]){
  let calls=0;const e={...environment(),...delta};const handler=make(e,{createAdapter(){calls++;throw Error('SYNTHETIC_SECRET');}});const res=response();await handler({method:'GET',url:'/__private/access',headers:{host:e.VERCEL_URL}},res);assert.equal(res.statusCode,503);assert.equal(calls,0);assert.doesNotMatch(res.body,/SYNTHETIC_SECRET/);
 }
});
test('private runtime: public aliases and all non-private routes remain inert',async()=>{
 let calls=0;const e=environment();const handler=make(e,{createAdapter(){calls++;throw Error('unexpected');}});
 for(const host of ['mantou-comments.vercel.app','mantou-comments-mantous-projects-af7e7067.vercel.app',e.VERCEL_URL])for(const url of ['/','/api/comment','/api/user','/__privateevil','/__private/access?key=fixture']){const res=response();await handler({method:'POST',url,headers:{host}},res);assert.equal(res.statusCode,503);}
 assert.equal(calls,0);
});
test('private runtime: only trusted explicit configuration reaches the private factory and no DB call occurs on access form',async()=>{
 const e=environment();let adapterCalls=0,pageCalls=0,dbCalls=0,opts;
 const adapter={getModels(){dbCalls++;},acquireBootstrap(){dbCalls++;},close(){}};
 const handler=make(e,{createAdapter({environment:read}){adapterCalls++;assert.equal(read(),e);return adapter;},createPage(options){opts=options;return async(req,res)=>{pageCalls++;res.end('synthetic form');};}});
 for(let i=0;i<2;i++){const res=response();await handler({method:'GET',url:'/__private/access',headers:{host:e.VERCEL_URL,'x-vercel-user-email':'forged@example.invalid'}},res);assert.equal(res.body,'synthetic form');}
 assert.equal(adapterCalls,1);assert.equal(pageCalls,2);assert.equal(dbCalls,0);assert.deepEqual(opts.identity,{email:e.PRIVATE_ADMIN_EMAIL,displayName:e.PRIVATE_ADMIN_DISPLAY_NAME});assert.equal(opts.origin,'https://'+e.VERCEL_URL);assert.equal(opts.ownerAccessKey,e.PRIVATE_ADMIN_ACCESS_KEY);assert.equal(opts.jwtSecret,e.JWT_TOKEN);assert.equal(opts.expiresAt,Date.parse(e.PRIVATE_ADMIN_EXPIRES_AT));
});
test('private runtime: factory/handler errors expose no configuration, body or exception text',async()=>{
 for(const createPage of [()=>{throw Error('SYNTHETIC_SECRET');},()=>async()=>{throw Error('SYNTHETIC_SECRET');}]){const e=environment();const handler=make(e,{createAdapter:()=>({getModels(){},acquireBootstrap(){}}),createPage});const res=response();await handler({method:'GET',url:'/__private/access',headers:{host:e.VERCEL_URL}},res);assert.equal(res.statusCode,503);assert.doesNotMatch(res.body,/SYNTHETIC_SECRET|fixture-signing|owner@example/);}
});
test('private runtime: current production entry and diagnostic profile do not import private setup',()=>{
 for(const f of ['../index.cjs','../deployment/staged-readonly.cjs'])assert.doesNotMatch(fs.readFileSync(require.resolve(f),'utf8'),/staged-private-admin|private-admin-page|private-admin-bootstrap/);
});
test('private runtime: expiration must be an explicit valid UTC ISO value before any adapter creation',async()=>{
 for(const value of ['', 'never', '2099-02-31T00:00:00Z', '2099-01-01T00:00:00+09:00']){
  let calls=0;const e={...environment(),PRIVATE_ADMIN_EXPIRES_AT:value};const handler=make(e,{createAdapter(){calls++;throw Error('unreachable');}});const res=response();await handler({method:'GET',url:'/__private/access',headers:{host:e.VERCEL_URL}},res);assert.equal(res.statusCode,503);assert.equal(calls,0);
 }
});
test('private runtime: optional profile explicitly disables Node helpers and leaves public routes disabled',()=>{
 const profile=JSON.parse(fs.readFileSync(require.resolve('../vercel.private-admin.json'),'utf8'));
 assert.equal(profile.env.NODEJS_HELPERS,'0');assert.equal(profile.build.env.NODEJS_HELPERS,'0');assert.equal(profile.installCommand,'npm ci --ignore-scripts --no-audit --no-fund');assert.deepEqual(profile.regions,['sin1']);assert.equal(profile.rewrites.at(-1).destination,'/api/disabled');assert.ok(profile.rewrites.slice(0,-1).every(r=>r.source.startsWith('/__private')&&r.destination==='/api/private-admin'));
 assert.deepEqual(Object.keys(profile.env),['NODEJS_HELPERS']);assert.ok(!JSON.stringify(profile).includes('PRIVATE_ADMIN_ACCESS_KEY'));assert.ok(!JSON.stringify(profile).includes('JWT_TOKEN'));
});
