'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const tls = require('node:tls');
const { once } = require('node:events');
const { MemoryModel } = require('./memory-model.cjs');
const { allowedRequest, reject, createPublicMiddleware, STATIC_AVATAR, assertIsolatedEnvironment } = require('../src/policy.cjs');
const reference = process.env.REFERENCE_PREBOOTSTRAP === '1';
const originalFetch = global.fetch;
const network = [], logs = [], restore = [];
let server, base, port;
const models = Object.fromEntries(['Comment', 'Counter', 'Users'].map(name => [name, new MemoryModel()]));
function replace(obj, key, value) { const original = obj[key]; obj[key] = value; restore.push(() => { obj[key] = original; }); return original; }
before(async () => {
  for (const key of Object.keys(process.env)) if (/^(SMTP_|WEBHOOK$|SC_KEY$|QYWX_AM$|QMSG_KEY$|TG_BOT_TOKEN$|PUSH_PLUS_KEY$|DISCORD_WEBHOOK$|LARK_WEBHOOK$|RECAPTCHA_V3_SECRET$|TURNSTILE_SECRET$)/.test(key)) delete process.env[key];
  Object.assign(process.env, { SQLITE_PATH: '/tmp/mantou-waline-in-memory-fixture-only', JWT_TOKEN: 'fixed-synthetic-test-token-not-a-secret', AKISMET_KEY: 'false', LOGIN: 'disable', DISABLE_AUTHOR_NOTIFY: 'true' });
  for (const [label, obj, name] of [['http', http, 'request'], ['https', https, 'request'], ['tls', tls, 'connect']]) replace(obj, name, () => { network.push(label); throw new Error('BLOCKED_EXTERNAL_TRANSPORT'); });
  const oldConnect = replace(net.Socket.prototype, 'connect', function (...args) {
    const options = Array.isArray(args[0]) ? args[0][0] : args[0];
    if (options && typeof options === 'object' && (options.host === '127.0.0.1' || options.hostname === '127.0.0.1') && Number(options.port) === port) return oldConnect.apply(this, args);
    network.push('net'); throw new Error('BLOCKED_EXTERNAL_SOCKET');
  });
  replace(global, 'fetch', async (url, options) => { if (String(url).startsWith('data:')) return originalFetch(url, options); network.push('fetch'); throw new Error('BLOCKED_EXTERNAL_FETCH'); });
  replace(console, 'error', (...args) => logs.push(args.map(String).join(' ')));
  let handler;
  if (reference) {
    const upstream = require('@waline/vercel')({ model: name => models[name], audit: true, disableRegion: true, disableUserAgent: true, oauthUrl: 'data:application/json,%7B%22services%22%3A%5B%5D%7D', avatarUrl: () => STATIC_AVATAR, plugins: [{ middlewares: createPublicMiddleware() }] });
    handler = (req, res) => allowedRequest(req) ? upstream(req, res) : reject(res);
  } else handler = require('../src/candidate.cjs').createIsolatedCandidate(name => models[name]);
  server = http.createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  port = server.address().port; base = `http://127.0.0.1:${port}`;
});
after(async () => { for (const fn of restore.reverse()) fn(); if (server) { server.close(); server.closeAllConnections(); await once(server, 'close'); } });
test('AC-022: malformed JSON before controller/plugin exposes no submitted text, stack, filename or trace', async () => {
  const response = await originalFetch(`${base}/api/comment`, { method: 'POST', signal: AbortSignal.timeout(2000), headers: { 'content-type': 'application/json' }, body: '{"SYNTHETIC_PRIVATE_PARSE":' });
  const text = await response.text();
  assert.equal(response.status, 400); assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = JSON.parse(text); assert.notEqual(body.errno, 0);
  assert.deepEqual(Object.keys(body).sort(), ['errmsg', 'errno']);
  assert.ok(!/SYNTHETIC_PRIVATE_PARSE|stack|SyntaxError|node_modules|\/workspace/.test(text));
  assert.ok(!logs.join('\n').includes('SYNTHETIC_PRIVATE_PARSE'));
  assert.equal(models.Comment.rows.length, 0);
});
test('AC-023: malformed and valid reader requests make zero instrumented external transport attempts', async () => {
  const response = await originalFetch(`${base}/api/comment`, { method: 'POST', signal: AbortSignal.timeout(2000), headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nick: 'Reader', comment: 'Synthetic transport check', url: '/posts/transport' }) });
  assert.equal(response.status, 200); assert.equal((await response.json()).data.status, 'waiting');
  assert.deepEqual(network, []);
});
test('isolation: alternate storage settings are rejected without echoing values', () => {
  for (const key of ['PG_PASSWORD', 'POSTGRES_URL', 'LEAN_KEY', 'TCB_ENV', 'MONGO_DB', 'MYSQL_DB', 'TIDB_DB', 'GITHUB_TOKEN', 'SQLITE_PATH']) {
    assert.throws(() => assertIsolatedEnvironment({ AKISMET_KEY: 'false', [key]: 'SYNTHETIC_PRIVATE_CONFIG' }), error => !error.message.includes('SYNTHETIC_PRIVATE_CONFIG'));
  }
});
test('isolation: a missing custom model cannot silently fall back to configured storage', async () => {
  const saved = models.Comment; delete models.Comment;
  try {
    const response = await originalFetch(`${base}/api/comment?path=%2Fposts%2Ftransport`, { signal: AbortSignal.timeout(2000) });
    const text = await response.text(); assert.equal(response.status, 500);
    assert.notEqual(JSON.parse(text).errno, 0); assert.ok(!/Missing isolated|node_modules|sqlite|SYNTHETIC/.test(text));
  } finally { models.Comment = saved; }
});
