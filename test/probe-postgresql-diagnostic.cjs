'use strict';
// Synthetic-only test subprocess: real adapter, fake Pool transport, no secrets.
const { EventEmitter } = require('node:events');
const scenario = process.argv[2];
const network = [], logs = [], sql = [];
for (const [label, object, key] of [
  ['net', require('node:net').Socket.prototype, 'connect'],
  ['tls', require('node:tls'), 'connect'],
  ['dns', require('node:dns'), 'lookup'],
]) object[key] = function () { network.push(label); throw new Error('SYNTHETIC_BLOCKED_EGRESS'); };
for (const name of ['log','error','warn','info','debug','trace']) console[name] = (...items) => logs.push(items.map(String).join(' '));
const env = { POSTGRES_HOST: 'ep-synthetic-private.ap-southeast-1.aws.neon.tech', POSTGRES_USER: 'synthetic-private', POSTGRES_PASSWORD: 'SYNTHETIC_SECRET', POSTGRES_DATABASE: 'synthetic-private' };
const secretError = () => new Error('SYNTHETIC_SECRET synthetic-private PRIVATE_SQL');
let poolCreated = 0, connects = 0, releases = 0, closes = 0, destroyRelease, options, environmentReads = 0;
class FakePool extends EventEmitter {
  constructor(config) { super(); poolCreated++; options = config; }
  async connect() {
    connects++;
    if (scenario === 'connection-error') throw secretError();
    if (scenario === 'connection-timeout') return new Promise(() => {});
    const pool = this;
    const client = new EventEmitter();
    client.connection = { stream: { encrypted: scenario !== 'unencrypted', authorized: scenario !== 'tls-error', getProtocol: scenario === 'missing-protocol' ? undefined : () => scenario === 'old-protocol' ? 'TLSv1.1' : 'TLSv1.3' } };
    client.release = destroy => { releases++; destroyRelease = destroy; if (scenario === 'release-error') throw secretError(); };
    client.query = (statement, callback) => {
      sql.push(statement);
      if (statement === 'BEGIN READ ONLY' && scenario === 'begin-error') return callback(secretError());
      if (statement === 'ROLLBACK' && scenario === 'rollback-error') return callback(secretError());
      if (statement.includes('pg_catalog.pg_class')) {
        if (scenario === 'query-error') return callback(secretError());
        if (scenario === 'query-timeout') return;
        if (scenario === 'idle-error') pool.emit('error', secretError());
        if (scenario === 'client-error') client.emit('error', secretError());
        const rows = ['wl_comment','wl_counter','wl_users'].map(table_name => ({table_name, present: !(scenario === 'missing' && table_name === 'wl_users'), readable: !(scenario === 'missing' && table_name === 'wl_users') && !(scenario === 'denied' && table_name === 'wl_comment')}));
        if (scenario === 'bad-catalog') rows[0].table_name = 'SYNTHETIC_SECRET';
        if (scenario === 'duplicate-catalog') rows[0].table_name = rows[1].table_name;
        if (scenario === 'contradictory-catalog') { rows[0].present = false; rows[0].readable = true; }
        return callback(null, { rows });
      }
      if (statement === 'SHOW transaction_read_only') return callback(null, { rows: [{ transaction_read_only: scenario === 'readonly-error' ? 'off' : 'on' }] });
      callback(null, { rows: [] });
    };
    if (scenario === 'late-connection') await new Promise(resolve => setTimeout(resolve, 5700));
    return client;
  }
  async end() { closes++; if (scenario === 'close-error') throw secretError(); }
}
require('pg').Pool = FakePool;
function response() { return { statusCode: 0, headers: {}, setHeader(key,value) { this.headers[key]=value; }, end(value) { this.body=JSON.parse(value); } }; }
(async () => {
  let result, statusCode, statusCodes, driver;
  if (scenario === 'driver-options') {
    Object.assign(process.env, { PGOPTIONS: '-c default_transaction_read_only=off', PGAPPNAME: 'SYNTHETIC_SECRET', PGSSLMODE: 'no-verify', PGSSLNEGOTIATION: 'direct', PGCLIENT_ENCODING: 'LATIN1', PGREPLICATION: 'database' });
    const config = require('../src/postgresql-diagnostic.cjs').createPostgresqlOptions(env);
    const parameters = new (require('pg').Client)(config).connectionParameters;
    driver = Object.fromEntries(['ssl','sslnegotiation','options','application_name','client_encoding','replication','port'].map(key => [key,parameters[key]]));
  } else if (scenario === 'inert') {
    require('../src/postgresql-diagnostic.cjs'); require('../src/protected-diagnostic-handler.cjs');
    Object.assign(process.env, env, { VERCEL_ENV: 'production', MANTOU_DIAGNOSTIC: '1' });
    const res=response(); require('../diagnostic.cjs')({method:'POST',url:'/__diagnostics/postgresql',headers:{authorization:'Bearer SYNTHETIC_SECRET'}},res); statusCode=res.statusCode;
  } else if (scenario.startsWith('handler-') || scenario === 'staged-success') {
    const {createProtectedDiagnosticHandler}=require('../src/protected-diagnostic-handler.cjs');
    const environment=()=>{ environmentReads++; return env; };
    const request={method:'POST',url:'/__diagnostics/postgresql',headers:{}};
    if (scenario === 'handler-denied') {
      statusCodes=[];
      for (const authorize of [undefined, ()=>false, ()=>({ok:true}), ()=>undefined, async()=>{throw secretError();}]) {
        const res=response(); await createProtectedDiagnosticHandler({authorize,environment})(request,res); statusCodes.push(res.statusCode);
      }
      for (const change of [{method:'GET'}, {url:'/__diagnostics/postgresql?sql=SELECT'}, {headers:{'content-length':'1'}}, {headers:{'transfer-encoding':'chunked'}}]) {
        const res=response(); await createProtectedDiagnosticHandler({authorize:()=>true,environment})({...request,...change},res); statusCodes.push(res.statusCode);
      }
    } else {
      const handler=scenario === 'staged-success' ? require('../deployment/staged-readonly.cjs').createStagedHandler(Object.assign(env,{VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_NtBPfOSSwqaOLH0tejtx7Da5eE9Q',VERCEL_URL:'mantou-comments-synthetic-mantous-projects-af7e7067.vercel.app'})) : createProtectedDiagnosticHandler({authorize:async()=>true,environment});
      if(scenario === 'staged-success') Object.assign(request.headers,{host:env.VERCEL_URL,origin:`https://${env.VERCEL_URL}`,'content-length':'0'});
      const responses=[response(),response()]; await Promise.all(responses.map(res=>handler(request,res)));
      statusCodes=responses.map(res=>res.statusCode); result=responses[0].body;
    }
  } else result=await require('../src/postgresql-diagnostic.cjs').runPostgresqlDiagnostic(env);
  if (scenario === 'late-connection') await new Promise(resolve => setTimeout(resolve, 350));
  process.stdout.write(JSON.stringify({driver,result,statusCode,statusCodes,environmentReads,poolCreated,connects,releases,closes,destroyRelease,sql,network,logs,options:options&&{max:options.max,ssl:options.ssl,logSql:options.logSql,logConnect:options.logConnect},importedWaline:Object.keys(require.cache).some(file=>file.includes('/@waline/')||file.includes('/thinkjs/'))}));
})().catch(()=>{process.stderr.write('Synthetic diagnostic probe failed');process.exitCode=1;});
