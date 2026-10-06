'use strict';
// Synthetic accounts and memory storage only. No real credentials, database,
// notifications, deployed routes or publication acceptance are exercised here.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { PasswordHash } = require('phpass');
const { createRequire } = require('node:module');
const { MemoryModel } = require('./memory-model.cjs');
const { createPrivateAdminPage } = require('../src/private-admin-page.cjs');
const serverRequire = createRequire(require.resolve('@waline/vercel/package.json'));
const ORIGIN = 'https://synthetic-moderation-fixture.vercel.app';
const KEY = 'A'.repeat(64);
const PASSWORD = 'Synthetic-only-password-123';
const EMAIL = 'synthetic-owner@example.invalid';
const hash = new PasswordHash().hashPasswordAsync(PASSWORD);
const csrf = page => page.text.match(/name="csrf" value="([^"]+)"/)?.[1];
const cookie = (page, name) => (page.headers['set-cookie'] || []).filter(x => !name || x.startsWith(name + '=')).map(x => x.split(';')[0]).join('; ');
async function fixture(options = {}) {
  const models = {
    Users: new MemoryModel([{ objectId: '1', email: EMAIL, display_name: 'Synthetic Owner', password: await hash, type: 'administrator' }]),
    Comment: new MemoryModel(options.rows || []), Counter: new MemoryModel(),
  };
  let updates = 0;
  const update = models.Comment.update.bind(models.Comment);
  models.Comment.update = async (...args) => { updates++; return update(...args); };
  const handler = createPrivateAdminPage({ origin: ORIGIN, identity: { email: EMAIL, displayName: 'Synthetic Owner' }, ownerAccessKey: KEY, jwtSecret: 'B'.repeat(64), expiresAt: Date.now() + 3600000, getModels: () => models, acquireBootstrap: () => { throw Error('SYNTHETIC_BOOTSTRAP_FORBIDDEN'); }, moderationEnabled: options.enabled ?? true });
  async function request(path, session, body, headers = {}) {
    const data = body === undefined ? null : new URLSearchParams(body).toString();
    const req = Readable.from(data === null ? [] : [Buffer.from(data)]);
    Object.assign(req, { url: path, method: data === null ? 'GET' : 'POST', headers: { host: new URL(ORIGIN).host, ...(session ? { cookie: session } : {}), ...(data === null ? {} : { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded', 'content-length': String(Buffer.byteLength(data)) }), ...headers } });
    const res = { headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(text) { this.text = text; this.writableEnded = true; } };
    await handler(req, res);
    return res;
  }
  const access = await request('/__private/access', null, { ownerAccessKey: KEY });
  assert.equal(access.statusCode, 303);
  const owner = cookie(access, '__Host-mantou-owner');
  const form = await request('/__private/login', owner);
  const login = await request('/__private/login', owner, { csrf: csrf(form), password: PASSWORD });
  assert.equal(login.statusCode, 303);
  const session = owner + '; ' + cookie(login);
  const core = serverRequire('@waline/core').createWalineCore({ models, config: { audit: true, disableRegion: true, disableUserAgent: true }, services: {} });
  return { request, owner, session, models, core, updates: () => updates };
}
const rows = () => [
  { objectId: 'root1', nick: '<img src=x onerror=alert(1)>', comment: '<script>synthetic()</script>', url: '/posts/synthetic', status: 'waiting', mail: 'SYNTHETIC_PRIVATE_MAIL', ip: 'SYNTHETIC_PRIVATE_IP' },
  { objectId: 'reply1', nick: 'Synthetic reply', comment: 'Synthetic pending reply', url: '/posts/synthetic', status: 'waiting', pid: 'root1', rid: 'root1' },
  { objectId: 'other1', nick: 'Synthetic sibling', comment: 'SYNTHETIC_STILL_WAITING', url: '/works/synthetic-other', status: 'waiting' },
  { objectId: 'approved1', comment: 'SYNTHETIC_ALREADY_PUBLIC', url: '/posts/synthetic', status: 'approved' },
];

test('moderation page: disabled option preserves the original home and rejects approval', async () => {
  const f = await fixture({ enabled: false, rows: rows() });
  const home = await f.request('/__private', f.session);
  assert.equal(home.statusCode, 200);
  assert.match(home.text, /Moderation controls are not included/);
  assert.doesNotMatch(home.text, /Approve comment/);
  assert.equal((await f.request('/__private', f.session, { csrf: csrf(home), objectId: 'root1' })).statusCode, 405);
  assert.equal(f.updates(), 0);
});

test('moderation page: queue is escaped, bounded and does not expose email or network metadata', async () => {
  const f = await fixture({ rows: rows() });
  const home = await f.request('/__private', f.session);
  assert.equal(home.statusCode, 200);
  assert.match(home.text, /Waiting comments/);
  assert.match(home.text, /&lt;script&gt;synthetic\(\)&lt;\/script&gt;/);
  assert.match(home.text, /Reply to root1/);
  assert.doesNotMatch(home.text, /<script>|<img|SYNTHETIC_PRIVATE_MAIL|SYNTHETIC_PRIVATE_IP|SYNTHETIC_ALREADY_PUBLIC/);
  assert.equal(home.headers['cache-control'], 'no-store');
  assert.match(home.headers['content-security-policy'], /default-src 'none'/);
  assert.match(home.text, /Source and licenses/);
  assert.equal(f.updates(), 0);
});

test('moderation page: only the selected root and reply become public after separate approval', async () => {
  const f = await fixture({ rows: rows().filter(row => row.status === 'waiting') });
  assert.equal((await f.core.comment.list({ path: '/posts/synthetic' }, { state: {}, headers: {} })).count, 0);
  for (const id of ['root1', 'reply1']) {
    const home = await f.request('/__private', f.session);
    const result = await f.request('/__private', f.session, { csrf: csrf(home), objectId: id });
    assert.equal(result.statusCode, 303);
    assert.equal(result.headers.location, '/__private');
    assert.equal(f.models.Comment.rows.find(row => row.objectId === id).status, 'approved');
    const visible = await f.core.comment.list({ path: '/posts/synthetic' }, { state: {}, headers: {} });
    assert.equal(visible.count, id === 'root1' ? 1 : 2);
    if (id === 'root1') assert.deepEqual(visible.data[0].children, []);
    else assert.equal(visible.data[0].children[0].objectId, 'reply1');
  }
  assert.equal(f.models.Comment.rows.find(row => row.objectId === 'other1').status, 'waiting');
  assert.equal(f.updates(), 2);
  const replayForm = await f.request('/__private', f.session);
  assert.equal((await f.request('/__private', f.session, { csrf: csrf(replayForm), objectId: 'root1' })).statusCode, 409);
  assert.equal(f.updates(), 2);
});

test('moderation page: owner-only, missing session, revoked role and cross-origin attempts cannot approve', async () => {
  const f = await fixture({ rows: rows() });
  const home = await f.request('/__private', f.session);
  const body = { csrf: csrf(home), objectId: 'root1' };
  assert.equal((await f.request('/__private', null, body)).statusCode, 403);
  assert.equal((await f.request('/__private', f.owner, body)).statusCode, 401);
  assert.equal((await f.request('/__private', f.session, body, { origin: 'https://evil.invalid' })).statusCode, 403);
  f.models.Users.rows[0].type = 'guest';
  assert.equal((await f.request('/__private', f.session, body)).statusCode, 401);
  assert.equal(f.updates(), 0);
});

test('moderation page: CSRF, fields and target validation fail without changing any row', async () => {
  const f = await fixture({ rows: rows() });
  const home = await f.request('/__private', f.session);
  const token = csrf(home);
  for (const [body, status] of [[{ csrf: 'wrong', objectId: 'root1' }, 403], [{ csrf: token, objectId: 'root1', status: 'approved' }, 400], [{ csrf: token, objectId: '<invalid>' }, 400], [{ csrf: token, objectId: 'missing' }, 404], [{ csrf: token, objectId: 'approved1' }, 409]]) {
    assert.equal((await f.request('/__private', f.session, body)).statusCode, status);
  }
  assert.equal(f.updates(), 0);
});

test('moderation page: unknown write result is not retried and gives a reconciliation instruction', async () => {
  const f = await fixture({ rows: rows() });
  const home = await f.request('/__private', f.session);
  const update = f.models.Comment.update.bind(f.models.Comment);
  f.models.Comment.update = async (...args) => { await update(...args); throw Error('SYNTHETIC_DRIVER_SECRET'); };
  const result = await f.request('/__private', f.session, { csrf: csrf(home), objectId: 'root1' });
  assert.equal(result.statusCode, 503);
  assert.match(result.text, /Do not submit approval again/);
  assert.doesNotMatch(result.text, /SYNTHETIC_DRIVER_SECRET/);
  assert.equal(result.headers['set-cookie'], undefined);
  assert.equal(f.updates(), 1);
  assert.equal(f.models.Comment.rows[0].status, 'approved');
});

test('moderation page: more than twenty waiting comments are paged at the core boundary', async () => {
  const f = await fixture({ rows: Array.from({ length: 25 }, (_, i) => ({ objectId: 'comment' + i, comment: 'Synthetic queue ' + i, nick: 'Synthetic', url: '/posts/synthetic', status: 'waiting', insertedAt: new Date(2026, 0, i + 1) })) });
  const home = await f.request('/__private', f.session);
  assert.equal(home.statusCode, 200);
  assert.equal((home.text.match(/<button type="submit">Approve comment /g) || []).length, 20);
  assert.equal(f.updates(), 0);
});
