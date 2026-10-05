'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { MemoryModel } = require('./memory-model.cjs');
const reference = process.env.REFERENCE_UPSTREAM === '1';
const models = { Comment: new MemoryModel(), Users: new MemoryModel(), Counter: new MemoryModel() };
let server, base;
const egress = [];
let mailTransportAttempts = 0;
const nodemailer = require('nodemailer');
const originalTransport = nodemailer.createTransport;
nodemailer.createTransport = () => { mailTransportAttempts++; throw new Error('TEST_BLOCKED_MAIL_TRANSPORT'); };
const originalFetch = global.fetch;
const contextEnv = {
  SQLITE_PATH: '/tmp/mantou-waline-in-memory-fixture-only',
  JWT_TOKEN: 'fixed-synthetic-test-token-not-a-secret',
  LOGIN: 'disable', AKISMET_KEY: 'false', DISABLE_AUTHOR_NOTIFY: 'true',
  DISABLE_REGION: 'true', DISABLE_USERAGENT: 'true',
};
const sideEffects = /^(?:SMTP_|WEBHOOK$|SC_KEY$|QYWX_AM$|QMSG_KEY$|TG_BOT_TOKEN$|PUSH_PLUS_KEY$|DISCORD_WEBHOOK$|LARK_WEBHOOK$|RECAPTCHA_V3_SECRET$|TURNSTILE_SECRET$)/;
for (const key of Object.keys(process.env)) if (sideEffects.test(key)) delete process.env[key];
Object.assign(process.env, contextEnv);
const fixtureOptions = {
  model: (name) => { assert.ok(models[name], `Unexpected model ${name}`); return models[name]; },
  audit: true, disableUserAgent: true, disableRegion: true,
  oauthUrl: 'data:application/json,%7B%22services%22%3A%5B%5D%7D',
  avatarUrl: () => 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E',
};
async function request(path, options = {}) {
  const response = await originalFetch(`${base}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', 'user-agent': 'synthetic-private-user-agent', 'x-forwarded-for': `192.0.2.${++request.ip}`, ...options.headers },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  return { status: response.status, headers: response.headers, text, body: JSON.parse(text) };
}
request.ip = 0;
function publicRow(id, extra = {}) {
  return { objectId: id, url: '/posts/synthetic', nick: 'Reader', comment: 'Public text', status: 'approved', insertedAt: new Date('2026-10-05T00:00:00Z'), mail: 'private-sentinel@example.invalid', ip: '192.0.2.199', ua: 'PRIVATE_UA_SENTINEL', ...extra };
}
before(async () => {
  global.fetch = async (url, options) => {
    if (!String(url).startsWith('data:')) { egress.push(String(url)); throw new Error('TEST_BLOCKED_EXTERNAL_EGRESS'); }
    return originalFetch(url, options);
  };
  const handler = reference
    ? require('@waline/vercel')(fixtureOptions)
    : require('../src/candidate.cjs').createIsolatedCandidate(fixtureOptions.model);
  server = http.createServer(handler);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { global.fetch = originalFetch; nodemailer.createTransport = originalTransport; if (server) { server.close(); await once(server, 'close'); } });
test('TM-015 / INV-001: actual package public JSON excludes raw UA and unknown private fields', async () => {
  models.Comment.rows = [publicRow('root1', { password: 'PRIVATE_PASSWORD_SENTINEL', unknownExtension: 'PRIVATE_EXTENSION_SENTINEL' })];
  const result = await request('/api/comment?path=%2Fposts%2Fsynthetic');
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('x-waline-version'), '1.43.4');
  assert.equal(result.body.data.data[0].objectId, 'root1');
  for (const privateValue of ['PRIVATE_UA_SENTINEL', 'PRIVATE_PASSWORD_SENTINEL', 'PRIVATE_EXTENSION_SENTINEL', 'private-sentinel@example.invalid', '192.0.2.199']) {
    assert.ok(!result.text.includes(privateValue), `Public response leaked ${privateValue}`);
  }
});
test('TM-004, TM-013: anonymous no-email comment persists in memory as waiting and is absent from anonymous list/count', async () => {
  models.Comment.rows = [];
  const result = await request('/api/comment', { method: 'POST', body: { nick: 'Reader', comment: 'Synthetic pending root', url: '/posts/synthetic', status: 'approved', user_id: 'pretend-admin', ua: 'PRIVATE_UA_SUBMIT_SENTINEL' } });
  assert.equal(result.status, 200);
  assert.equal(result.body.errno, 0);
  assert.ok(result.body.data.objectId);
  assert.equal(result.body.data.status, 'waiting');
  assert.equal(models.Comment.rows.length, 1);
  assert.equal(models.Comment.rows[0].status, 'waiting');
  assert.equal(models.Comment.rows[0].mail, undefined);
  assert.equal(models.Comment.rows[0].user_id, undefined);
  assert.ok(!result.text.includes('PRIVATE_UA_SUBMIT_SENTINEL'));
  const list = await request('/api/comment?path=%2Fposts%2Fsynthetic');
  assert.equal(list.body.data.count, 0); assert.deepEqual(list.body.data.data, []);
  const count = await request('/api/comment?type=count&url=%2Fposts%2Fsynthetic');
  assert.deepEqual(count.body.data, [0]);
});
test('TM-004, TM-013: anonymous reply is waiting despite forged approved status', async () => {
  models.Comment.rows = [publicRow('root2')];
  const result = await request('/api/comment', { method: 'POST', body: { nick: 'Reader', mail: '', comment: 'Synthetic pending reply', url: '/posts/synthetic', pid: 'root2', rid: 'root2', status: 'approved' } });
  assert.equal(result.body.errno, 0); assert.equal(result.body.data.status, 'waiting');
  assert.equal(models.Comment.rows[1].status, 'waiting'); assert.equal(models.Comment.rows[1].mail, '');
  const list = await request('/api/comment?path=%2Fposts%2Fsynthetic');
  assert.equal(list.body.data.count, 1); assert.deepEqual(list.body.data.data[0].children, []);
});
test('TM-013: pre-seeded waiting/spam rows never enter public root list/count', async () => {
  models.Comment.rows = [publicRow('approved1'), publicRow('wait1', { status: 'waiting', comment: 'HIDDEN_WAIT_SENTINEL' }), publicRow('spam1', { status: 'spam', comment: 'HIDDEN_SPAM_SENTINEL' })];
  const result = await request('/api/comment?path=%2Fposts%2Fsynthetic');
  assert.equal(result.body.data.count, 1); assert.equal(result.body.data.data.length, 1);
  assert.ok(!result.text.includes('HIDDEN_'));
});
test('TM-016 / AC-012: first-administrator registration stays closed with an empty user store', async () => {
  models.Users.rows = [];
  const result = await request('/api/user', { method: 'POST', body: { email: 'bootstrap-fixture@example.invalid', password: 'synthetic-test-password-not-a-secret' } });
  assert.equal(result.status, 403); assert.equal(models.Users.rows.length, 0);
});
test('TM-015: anonymous update/delete/export and alternate registration paths remain closed', async () => {
  models.Comment.rows = [publicRow('approved2')]; models.Users.rows = [];
  for (const [method, path, body] of [
    ['PUT', '/api/comment/approved2', { status: 'approved' }], ['DELETE', '/api/comment/approved2'],
    ['GET', '/api/db'], ['POST', '/user', { email: 'x@example.invalid', password: 'test' }],
    ['POST', '/api/%75ser', {}], ['GET', '/api/comment?type=list'], ['GET', '/api/comment?type=recent'],
    ['POST', '/api/comment?method=delete&id=approved2', {}], ['GET', '/ui'],
  ]) {
    const result = await request(path, { method, body });
    assert.ok([401, 403].includes(result.status) || [401, 403].includes(result.body.errno), `${method} ${path}: ${result.status}/${result.body.errno}`);
  }
  assert.equal(models.Comment.rows.length, 1); assert.equal(models.Users.rows.length, 0);
});
test('AC-023 (TM-035 notification-enable cases remain postponed): tested comment and reply flows make no external fetch calls', () => {
  assert.deepEqual(egress, []); assert.equal(mailTransportAttempts, 0);
});
