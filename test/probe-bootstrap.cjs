'use strict';
// Synthetic-only startup probe. Block and record every instrumented transport;
// intercept config writes so the upstream red test cannot persist its sentinel.
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const tls = require('node:tls');
const { MemoryModel } = require('./memory-model.cjs');
const network = [], snapshots = [];
for (const [label, obj, name] of [['http', http, 'request'], ['https', https, 'request'], ['net', net.Socket.prototype, 'connect'], ['tls', tls, 'connect']]) {
  obj[name] = function () { network.push(label); throw new Error('SYNTHETIC_BLOCKED_EGRESS'); };
}
const originalWrite = fs.writeFileSync;
fs.writeFileSync = function (path, data, ...args) {
  if (String(path).includes('/runtime/config/')) { snapshots.push(String(data)); return; }
  return originalWrite(path, data, ...args);
};
Object.assign(process.env, { SQLITE_PATH: '/tmp/mantou-waline-in-memory-fixture-only', JWT_TOKEN: 'SYNTHETIC_BOOTSTRAP_TOKEN', AKISMET_KEY: 'false', LOGIN: 'disable', DISABLE_AUTHOR_NOTIFY: 'true' });
const models = Object.fromEntries(['Comment', 'Counter', 'Users'].map(name => [name, new MemoryModel()]));
require('../src/candidate.cjs').createIsolatedCandidate(name => models[name]);
setImmediate(async () => {
  const config = think.config('model').postgresql;
  const Socket = require('think-model-postgresql/lib/socket');
  const pgLogs = [];
  const socket = new Socket({ ...config, host: 'synthetic.invalid', user: 'synthetic', password: 'SYNTHETIC_PG_PASSWORD', database: 'synthetic', logger: line => pgLogs.push(line) });
  const poolSSL = socket.pool.options.ssl; // Creates a pool, never connects.
  await socket.query({ sql: "SELECT 'SYNTHETIC_PRIVATE_SQL'", debounce: false }, { query(sql, cb) { cb(null, { rows: [] }); }, release() {} });
  await socket.close();
  process.stdout.write(JSON.stringify({ pgLogs, poolSSL, network, snapshots, pg: { ssl: config.ssl, logSql: config.logSql, logConnect: config.logConnect }, imported: Object.keys(require.cache).filter(p => /node_modules\/(?:@cloudbase|leancloud|akismet|request\/|protobufjs)/.test(p)) }));
});
