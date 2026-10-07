'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createPublishedThreadRegistry,CACHE_MS,FETCH_TIMEOUT_MS,VERSION_URL,MANIFEST_URL}=require('../src/published-thread-registry.cjs');
const OLD='/p/old/',NEW='/p/new/',WORK='/works/new-work/',SHA='a'.repeat(40),NEXT='b'.repeat(40);
function response(url,body,options={}){
 const r=new Response(typeof body==='string'||body instanceof ReadableStream?body:JSON.stringify(body),{status:200,headers:{'content-type':'application/json'},...options});
 Object.defineProperty(r,'url',{value:url});return r;
}
function fixture(){
 let time=0,sha=SHA,paths=[OLD,NEW,WORK],failure;const calls=[],events=[];
 const fetchImpl=async(url,options)=>{calls.push({url,options});if(failure)return failure(url,options);return response(url,url===VERSION_URL?{commit_sha:sha,deploy_branch:'main',run_id:'1',run_attempt:'1'}:{version:1,sourceCommit:sha,paths});};
 const registry=createPublishedThreadRegistry({fallbackPaths:[OLD],fetchImpl,now:()=>time,onRefresh:event=>events.push(event)});
 return{registry,calls,events,advance:()=>{time+=CACHE_MS+1;},set:(nextPaths,nextSha=NEXT)=>{paths=nextPaths;sha=nextSha;},fail:f=>{failure=f;}};
}
test('registry: published article and work additions are accepted from exact credential-free production URLs',async()=>{
 const f=fixture();assert.equal(await f.registry.isAllowed(NEW),true);assert.equal(await f.registry.isAllowed(WORK),true);assert.equal(f.calls.length,2);
 assert.deepEqual(f.calls.map(x=>x.url),[VERSION_URL,MANIFEST_URL]);for(const c of f.calls){assert.equal(c.options.method,'GET');assert.equal(c.options.credentials,'omit');assert.equal(c.options.redirect,'error');assert.equal(c.options.cache,'no-store');assert.deepEqual(c.options.headers,{accept:'application/json'});}
 assert.deepEqual(f.events,[{event:'published_threads_refresh',result:'updated',sourceCommit:SHA,count:3}]);
});
test('registry: simultaneous cold requests share a refresh, and arbitrary misses cannot bypass the cache interval',async()=>{
 const f=fixture();assert.deepEqual(await Promise.all(Array.from({length:50},()=>f.registry.isAllowed(NEW))),Array(50).fill(true));assert.equal(f.calls.length,2);
 for(let i=0;i<20;i++)assert.equal(await f.registry.isAllowed('/p/unknown'+i+'/'),false);assert.equal(f.calls.length,2);f.advance();assert.equal(await f.registry.isAllowed(NEW),true);assert.equal(f.calls.length,4);assert.equal(f.events[1].result,'unchanged');
});
test('registry: a new publication replaces the allowlist, and a valid empty publication closes old paths',async()=>{
 const f=fixture();await f.registry.isAllowed(OLD);f.set([WORK]);f.advance();assert.equal(await f.registry.isAllowed(OLD),false);assert.equal(await f.registry.isAllowed(WORK),true);f.set([], 'c'.repeat(40));f.advance();assert.equal(await f.registry.isAllowed(WORK),false);assert.equal(f.events.at(-1).count,0);
});
test('registry: malformed and translated identifiers fail before any upstream request',async()=>{
 const f=fixture();for(const p of ['/en'+NEW,'/p/../','//evil.invalid/','https://evil.invalid/','/p/a/?x=1','/p/'+('a'.repeat(200))+'/',undefined])assert.equal(await f.registry.isAllowed(p),false);assert.equal(f.calls.length,0);
});
test('registry: network failure retains the shipped seed and never logs upstream error details',async()=>{
 const f=fixture();f.fail(()=>{throw Error('SYNTHETIC_CREDENTIAL_DETAIL_DO_NOT_LOG');});assert.equal(await f.registry.isAllowed(OLD),true);assert.equal(await f.registry.isAllowed(NEW),false);assert.equal(f.calls.length,1);assert.equal(f.events[0].failureKind,'network');assert.doesNotMatch(JSON.stringify(f.events),/SYNTHETIC_CREDENTIAL/);
});
test('registry: failed refresh retains a previously verified added path and throttles subsequent failures',async()=>{
 const f=fixture();await f.registry.isAllowed(NEW);f.advance();f.fail(url=>response(url,'not json',{status:503}));assert.equal(await f.registry.isAllowed(NEW),true);assert.equal(await f.registry.isAllowed('/p/never-published/'),false);assert.equal(f.calls.length,3);assert.equal(f.events.at(-1).failureKind,'http');
});
test('registry: wrong publication branch, version mismatch, malformed paths and duplicate keys are rejected',async()=>{
 const invalid=[
  [VERSION_URL,{commit_sha:SHA,deploy_branch:'manual-preview',run_id:'1',run_attempt:'1'}],
  [VERSION_URL,{commit_sha:SHA,deploy_branch:'main',run_id:1,run_attempt:'1'}],
  [MANIFEST_URL,{version:1,sourceCommit:NEXT,paths:[NEW]}],
  [MANIFEST_URL,{version:2,sourceCommit:SHA,paths:[NEW]}],
  [MANIFEST_URL,{version:1,sourceCommit:SHA,paths:[NEW,NEW]}],
  [MANIFEST_URL,{version:1,sourceCommit:SHA,paths:['/en'+NEW]}],
  [MANIFEST_URL,{version:1,sourceCommit:SHA,paths:[NEW],extra:'SYNTHETIC_DO_NOT_LOG'}],
  [MANIFEST_URL,'{"version":1,"version":1,"sourceCommit":"'+SHA+'","paths":["'+NEW+'"]}'],
 ];
 for(const [target,body]of invalid){const f=fixture();f.fail(url=>response(url,url===target?body:url===VERSION_URL?{commit_sha:SHA,deploy_branch:'main',run_id:'1',run_attempt:'1'}:{version:1,sourceCommit:SHA,paths:[NEW]}));assert.equal(await f.registry.isAllowed(NEW),false);assert.equal(await f.registry.isAllowed(OLD),true);assert.equal(f.events.at(-1).result,'unavailable');assert.doesNotMatch(JSON.stringify(f.events),/SYNTHETIC_DO_NOT_LOG/);}
});
test('registry: redirects, HTML error pages and oversized responses cannot replace the registry',async()=>{
 for(const kind of ['redirect','html','declared-size','streamed-size']){
  const f=fixture();f.fail(url=>{if(kind==='redirect'){const r=response('https://evil.invalid/',{});Object.defineProperty(r,'redirected',{value:true});return r;}if(kind==='html')return response(url,'<html>failure</html>',{headers:{'content-type':'text/html'}});if(kind==='declared-size')return response(url,{}, {headers:{'content-type':'application/json','content-length':'999999'}});return response(url,' '.repeat(262145));});assert.equal(await f.registry.isAllowed(OLD),true);assert.equal(await f.registry.isAllowed(NEW),false);assert.equal(f.events[0].result,'unavailable');
 }
});
test('registry: a stalled fetch is bounded and preserves the seed',async()=>{
 const f=fixture();f.fail(()=>new Promise(()=>{}));const start=Date.now();assert.equal(await f.registry.isAllowed(OLD),true);assert.ok(Date.now()-start<FETCH_TIMEOUT_MS+1000);assert.equal(f.events[0].failureKind,'timeout');
});
test('registry: invalid configuration is rejected, and mutating the caller seed never widens the registry',async()=>{
 for(const paths of [[OLD,OLD],['/en'+OLD],['/p/../'],null])assert.throws(()=>createPublishedThreadRegistry({fallbackPaths:paths}),TypeError);
 const paths=[OLD],r=createPublishedThreadRegistry({fallbackPaths:paths,fetchImpl:()=>{throw Error('offline');}});paths.push(NEW);assert.equal(await r.isAllowed(NEW),false);
});
