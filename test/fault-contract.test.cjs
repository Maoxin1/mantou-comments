'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { MemoryModel } = require('./memory-model.cjs');
const privateMarker = 'SYNTHETIC_PRIVATE_DATABASE_ERROR';
const originalFetch = global.fetch;
let server, base;
const models = { Comment: new MemoryModel(), Users: new MemoryModel(), Counter: new MemoryModel() };
for (const key of Object.keys(process.env)) if (/^(SMTP_|WEBHOOK$|SC_KEY$|QYWX_AM$|QMSG_KEY$|TG_BOT_TOKEN$|PUSH_PLUS_KEY$|DISCORD_WEBHOOK$|LARK_WEBHOOK$|RECAPTCHA_V3_SECRET$|TURNSTILE_SECRET$)/.test(key)) delete process.env[key];
Object.assign(process.env, { SQLITE_PATH: '/tmp/mantou-waline-in-memory-fixture-only', JWT_TOKEN: 'fixed-synthetic-test-token-not-a-secret', LOGIN: 'disable', AKISMET_KEY: 'false', DISABLE_AUTHOR_NOTIFY: 'true', DISABLE_REGION: 'true', DISABLE_USERAGENT: 'true' });
before(async () => {
  global.fetch = async (url, options) => {
    assert.ok(String(url).startsWith('data:'), 'No external fetch is authorized'); return originalFetch(url, options);
  };
  server = http.createServer(require('../src/candidate.cjs').createIsolatedCandidate((name) => models[name]));
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { global.fetch = originalFetch; server.close(); await once(server, 'close'); });
test('AC-022: controller/model exceptions do not expose error text over real local HTTP', async () => {
  const original = models.Comment.select;
  models.Comment.select = async () => { throw new Error(privateMarker); };
  try {
    const response = await originalFetch(`${base}/api/comment?path=%2Fposts%2Fsynthetic`);
    const text = await response.text();
    assert.equal(response.status, 500); assert.ok(!text.includes(privateMarker)); assert.notEqual(JSON.parse(text).errno, 0);
  } finally { models.Comment.select = original; }
});
test('AC-034: a fault after in-memory add is treated as unknown, never falsely as definitely not saved', async () => {
  const original = models.Comment.add;
  models.Comment.add = async (data) => { await original.call(models.Comment, data); throw new Error(privateMarker); };
  try {
    const response = await originalFetch(`${base}/api/comment`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nick: 'Reader', comment: 'Synthetic post-write fault', url: '/posts/fault' }) });
    const text = await response.text(); const body = JSON.parse(text);
    assert.equal(response.status, 500); assert.equal(models.Comment.rows.length, 1);
    assert.match(body.errmsg, /unknown/); assert.ok(!text.includes(privateMarker));
  } finally { models.Comment.add = original; }
});
