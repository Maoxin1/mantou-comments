'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPostgresqlOptions}=require('../src/postgresql-diagnostic.cjs');
const direct='ep-synthetic.ap-southeast-1.aws.neon.tech';
const pooled='ep-synthetic-pooler.ap-southeast-1.aws.neon.tech';
const env={POSTGRES_HOST:pooled,PGHOST_UNPOOLED:direct,POSTGRES_USER:'fixture',POSTGRES_PASSWORD:'SYNTHETIC_ONLY',POSTGRES_DATABASE:'fixture'};
test('direct diagnostic: existing direct host must match the exact same Neon endpoint',()=>{
 const config=createPostgresqlOptions(env);assert.equal(config.host,direct);assert.equal(env.POSTGRES_HOST,pooled);assert.equal(config.user,env.POSTGRES_USER);assert.equal(config.database,env.POSTGRES_DATABASE);assert.equal(config.password,env.POSTGRES_PASSWORD);
});
test('direct diagnostic: pooled host fails closed for missing or mismatched direct identity',()=>{
 for(const host of [undefined,'',pooled,'ep-other.ap-southeast-1.aws.neon.tech','ep-synthetic.us-east-1.aws.neon.tech','ep-synthetic.ap-southeast-1.aws.neon.tech\n','https://'+direct,'127.0.0.1',direct+'.evil.invalid']) assert.throws(()=>createPostgresqlOptions({...env,PGHOST_UNPOOLED:host}),/^Error: Diagnostic configuration is invalid$/);
});
test('direct diagnostic: startup safety, strict TLS, deadlines and split credentials stay unchanged',()=>{
 const config=createPostgresqlOptions(env),reference=createPostgresqlOptions({...env,POSTGRES_HOST:direct});assert.deepEqual(config,reference);
 const client=new(require('pg').Client)(config);assert.equal(client.connectionParameters.host,direct);assert.deepEqual(client.connectionParameters.ssl,{rejectUnauthorized:true,minVersion:'TLSv1.2'});
 const startup=client.getStartupConf();assert.equal(startup.options,'-c default_transaction_read_only=on -c search_path=pg_catalog');assert.equal(startup.statement_timeout,'2000');assert.equal(startup.lock_timeout,'1000');assert.equal(startup.idle_in_transaction_session_timeout,'3000');assert.equal(startup.replication,'false');assert.equal(config.connectionTimeoutMillis,5000);assert.equal(config.max,1);assert.equal(config.logSql,false);assert.equal(config.logConnect,false);
});
test('direct diagnostic: report route and protocol-origin labels are fixed and unknown fields never escape',()=>{
 const {projectDiagnosticReport}=require('../src/diagnostic-report.cjs');
 for(const connectionRoute of ['already_direct','same_endpoint_unpooled']) for(const protocolSource of ['node_transport','postgresql']){
  const r=projectDiagnosticReport(JSON.stringify({status:'connection_failed',transport:'unconfirmed',failureClass:'connection',failurePhase:'connect',failureReason:'protocol_rejected',connectionRoute,protocolSource}),503);assert.equal(r.connectionRoute,connectionRoute);assert.equal(r.protocolSource,protocolSource);
 }
 const r=projectDiagnosticReport(JSON.stringify({status:'connection_failed',transport:'unconfirmed',connectionRoute:'SYNTHETIC_SECRET',protocolSource:'SYNTHETIC_SECRET',failureCode:'08P01',message:'SYNTHETIC_SECRET'}),503);assert.equal(r.connectionRoute,undefined);assert.equal(r.protocolSource,undefined);assert.doesNotMatch(JSON.stringify(r),/SYNTHETIC_SECRET|08P01/);
});
test('direct diagnostic: actual error paths distinguish the two protocol codes without returning raw codes',()=>{
 const {spawnSync}=require('node:child_process'),path=require('node:path');
 for(const [scenario,protocolSource] of [['protocol','postgresql'],['protocol_transport','node_transport']]){
  const c=spawnSync(process.execPath,[path.join(__dirname,'probe-diagnostic-failure-phase.cjs'),scenario],{encoding:'utf8',timeout:10000});assert.equal(c.status,0,c.stderr);const o=JSON.parse(c.stdout);assert.equal(o.result.protocolSource,protocolSource);assert.equal(o.result.connectionRoute,'already_direct');assert.deepEqual(o.network,[]);assert.deepEqual(o.logs,[]);assert.doesNotMatch(c.stdout,/SYNTHETIC_SECRET|08P01|EPROTO/);
 }
});
