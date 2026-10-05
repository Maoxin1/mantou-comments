'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
function response(){return{statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}};}
function env(){let reads=0;const values={VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_NtBPfOSSwqaOLH0tejtx7Da5eE9Q',VERCEL_URL:'mantou-comments-synthetic-mantous-projects-af7e7067.vercel.app'};return {value:new Proxy(values,{get(o,k){if(String(k).startsWith('POSTGRES_'))reads++;return o[k];}}),reads:()=>reads};}
test('diagnostic report: protected GET renders a no-input form without reading DB configuration',async()=>{
 const e=env();const res=response();await require('../deployment/staged-readonly.cjs').createStagedHandler(e.value)({method:'GET',url:'/__diagnostics/report',headers:{host:e.value.VERCEL_URL}},res);
 assert.equal(res.statusCode,200);assert.match(res.body,/<form method="post" action="\/__diagnostics\/report">/);assert.equal(e.reads(),0);assert.equal(res.headers['cache-control'],'no-store');
});
test('diagnostic report: displays authorization/framing rejection without accessing credentials or declaring success',async()=>{
 for(const headers of [{},{origin:'https://evil.invalid'},{origin:'https://mantou-comments-synthetic-mantous-projects-af7e7067.vercel.app','content-length':'1'}]){
  const e=env();const res=response();await require('../deployment/staged-readonly.cjs').createStagedHandler(e.value)({method:'POST',url:'/__diagnostics/report',headers:{host:e.value.VERCEL_URL,...headers}},res);
  assert.equal(res.statusCode,200);assert.match(res.body,/request_rejected/);assert.match(res.body,/"diagnosticHttpStatus": 503/);assert.doesNotMatch(res.body,/"status": "ok"/);assert.equal(e.reads(),0);
 }
 const e=env(),res=response();await require('../deployment/staged-readonly.cjs').createStagedHandler(e.value)({method:'GET',url:'/__diagnostics/report',headers:{host:'mantou-comments.vercel.app'}},res);assert.equal(res.statusCode,503);assert.equal(e.reads(),0);
});
test('diagnostic report: projections never echo raw errors, unknown codes, credentials or HTML',()=>{
 const {projectDiagnosticReport,renderDiagnosticReport}=require('../src/diagnostic-report.cjs');
 const hostile={status:'connection_failed',transport:'unconfirmed',failureClass:'SYNTHETIC_SECRET',error:'SYNTHETIC_SECRET',password:'SYNTHETIC_SECRET',host:'synthetic-private',tables:{wl_comment:'<script>alert(1)</script>',untrusted:'SYNTHETIC_SECRET'}};
 const report=projectDiagnosticReport(JSON.stringify(hostile),503);const res=response();renderDiagnosticReport(res,report);
 assert.equal(res.statusCode,200);assert.equal(report.status,'connection_failed');assert.equal(report.failureClass,'unknown');
 assert.doesNotMatch(res.body,/SYNTHETIC_SECRET|synthetic-private|<script>|alert\(1\)/);assert.match(res.body,/not a database acceptance pass/);assert.equal(res.headers['x-content-type-options'],'nosniff');
 assert.equal(projectDiagnosticReport('non JSON SYNTHETIC_SECRET',500).status,'unavailable');
 assert.equal(projectDiagnosticReport(JSON.stringify({status:'ok',transport:'unconfirmed'}),200).status,'unavailable');
});
test('diagnostic report: fixed safe error classes distinguish authentication, TLS and network failures',()=>{
 for(const [scenario,expected] of [['report-auth','authentication'],['report-tls','tls_verification'],['report-network','network']]){
  const child=spawnSync(process.execPath,[path.join(__dirname,'probe-diagnostic-report.cjs'),scenario],{encoding:'utf8',timeout:10000});assert.equal(child.status,0,child.stderr);const out=JSON.parse(child.stdout);
  assert.equal(out.http,200);assert.match(out.html,/connection_failed/);assert.match(out.html,new RegExp('"failureClass": "'+expected+'"'));assert.doesNotMatch(out.html,/SYNTHETIC_SECRET|synthetic-private/);assert.equal(out.connects,1);assert.equal(out.closes,1);assert.deepEqual(out.network,[]);assert.deepEqual(out.logs,[]);
 }
});
test('diagnostic report: additive deployment profile leaves the previous profile and routes intact',()=>{
 const old=JSON.parse(fs.readFileSync(path.join(__dirname,'../vercel.diagnostic.json')));const next=JSON.parse(fs.readFileSync(path.join(__dirname,'../vercel.diagnostic-report.json')));
 assert.deepEqual(next,{...old,rewrites:[{source:'/__diagnostics/report',destination:'/api/readonly'},...old.rewrites]});
});
