'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createStagedHandler}=require('../deployment/staged-readonly.cjs');
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},end(value){this.body=value;}};}
function environment(change={}) { const env={VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_NtBPfOSSwqaOLH0tejtx7Da5eE9Q',VERCEL_URL:'mantou-comments-synthetic-mantous-projects-af7e7067.vercel.app',...change};Object.defineProperty(env,'POSTGRES_PASSWORD',{get(){throw new Error('Credentials must not be read');}});return env; }
test('staged diagnostic: only the fixed generated host and Production project may render the no-query form',async()=>{
 const env=environment();const req={method:'GET',url:'/__diagnostics',headers:{host:env.VERCEL_URL}};const res=response();await createStagedHandler(env)(req,res);
 assert.equal(res.statusCode,200);assert.match(res.body,/<form method="post" action="\/__diagnostics\/postgresql">/);assert.equal(res.headers['cache-control'],'no-store');assert.match(res.headers['content-security-policy'],/form-action 'self'/);
 for(const change of [{VERCEL_ENV:'preview'},{VERCEL_PROJECT_ID:'different'},{VERCEL_URL:'mantou-comments.vercel.app'},{VERCEL_URL:'evil.invalid'}]) { const denied=response();await createStagedHandler(environment(change))(req,denied);assert.equal(denied.statusCode,503); }
});
test('staged diagnostic: public aliases, arbitrary routes, bodies and cross-origin POSTs fail before credentials',async()=>{
 const env=environment();const handler=createStagedHandler(env);
 for(const req of [
  {method:'GET',url:'/',headers:{host:env.VERCEL_URL}},
  {method:'GET',url:'/__diagnostics',headers:{host:'mantou-comments.vercel.app'}},
  {method:'POST',url:'/__diagnostics/postgresql',headers:{host:env.VERCEL_URL}},
  {method:'POST',url:'/__diagnostics/postgresql',headers:{host:env.VERCEL_URL,origin:'https://evil.invalid'}},
  {method:'POST',url:'/__diagnostics/postgresql',headers:{host:env.VERCEL_URL,origin:`https://${env.VERCEL_URL}`,'content-length':'1'}},
 ]){const res=response();await handler(req,res);assert.equal(res.statusCode,503);assert.doesNotMatch(res.body,/Credentials|SECRET|stack/);}
});

test('staged diagnostic: same-origin eligible POST reaches only the synthetic read-only adapter once',()=>{
 const {spawnSync}=require('node:child_process');const path=require('node:path');
 const child=spawnSync(process.execPath,[path.join(__dirname,'probe-postgresql-diagnostic.cjs'),'staged-success'],{encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);const out=JSON.parse(child.stdout);
 assert.deepEqual(out.statusCodes,[200,200]);assert.equal(out.result.status,'ok');assert.equal(out.connects,1);assert.equal(out.releases,1);
 assert.deepEqual(out.logs,[]);assert.deepEqual(out.network,[]);assert.equal(out.importedWaline,false);
});
test('staged diagnostic: deployment profile uses modern functions with fixed routing and script-disabled install',()=>{
 const fs=require('node:fs');const path=require('node:path');const root=path.join(__dirname,'..');
 const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.diagnostic.json')));
 assert.equal(config.builds,undefined);assert.equal(config.functions['api/readonly.js'].maxDuration,30);
 assert.equal(config.installCommand,'npm ci --ignore-scripts --no-audit --no-fund');
 assert.deepEqual(config.regions,['sin1']);assert.deepEqual(config.rewrites,[{source:'/__diagnostics',destination:'/api/readonly'},{source:'/__diagnostics/postgresql',destination:'/api/readonly'},{source:'/:path*',destination:'/api/disabled'}]);
 assert.equal(fs.readFileSync(path.join(root,'.npmrc'),'utf8'),'ignore-scripts=true\n');
 assert.equal(require('../api/disabled.js'),require('../index.cjs'));
});
