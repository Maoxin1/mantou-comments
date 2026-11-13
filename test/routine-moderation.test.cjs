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
  const handler = createPrivateAdminPage({ origin: ORIGIN, identity: { email: EMAIL, displayName: 'Synthetic Owner' }, ownerAccessKey: KEY, jwtSecret: 'B'.repeat(64), expiresAt: options.expiresAt ?? Date.now() + 3600000, getModels: () => models, acquireBootstrap: () => { throw Error('SYNTHETIC_BOOTSTRAP_FORBIDDEN'); }, moderationEnabled: options.enabled ?? true, moderationPaths: options.paths ?? null });
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

const pending = (n = 25) => Array.from({ length: n }, (_, i) => ({ objectId: 'item' + i, comment: 'Synthetic queue ' + i, nick: 'Synthetic', url: '/p/synthetic/', status: 'waiting', insertedAt: new Date(2026, 0, i + 1) }));
const ids = html => [...html.matchAll(/<h3>Comment ([^<]+)<\/h3>/g)].map(match => match[1]);

test('routine moderation: navigation reaches every item beyond twenty without publishing', async () => {
  const f = await fixture({ rows: pending() });
  const first = await f.request('/__private', f.session);
  assert.match(first.text, /href="\/__private\?view=waiting&amp;page=2"/);
  const second = await f.request('/__private?view=waiting&page=2', f.session);
  assert.equal(second.statusCode, 200);
  assert.equal(ids(first.text).length, 20);
  assert.equal(ids(second.text).length, 5);
  assert.equal(new Set([...ids(first.text), ...ids(second.text)]).size, 25);
  assert.match(second.text, /Previous page/);
  assert.doesNotMatch(second.text, />Next page</);
  assert.equal(f.updates(), 0);
  assert.equal((await f.core.comment.list({ path: '/p/synthetic/' }, { state: {}, headers: {} })).count, 0);
});

test('routine moderation: rejection is hidden and reversible through the spam view', async () => {
  const f = await fixture({ rows: pending(2) });
  const home = await f.request('/__private', f.session);
  assert.match(home.text, /name="action" value="spam"/);
  const reject = await f.request('/__private', f.session, { csrf: csrf(home), objectId: 'item0', action: 'spam' });
  assert.equal(reject.statusCode, 303);
  assert.equal(f.models.Comment.rows[0].status, 'spam');
  assert.equal(f.models.Comment.rows.length, 2);
  const spam = await f.request('/__private?view=spam&page=1', f.session);
  assert.equal(spam.statusCode, 200);
  assert.deepEqual(ids(spam.text), ['item0']);
  assert.match(spam.text, /Restore to waiting/);
  assert.doesNotMatch(spam.text, /Approve comment/);
  const restore = await f.request('/__private', f.session, { csrf: csrf(spam), objectId: 'item0', action: 'restore', view: 'spam', page: '1' });
  assert.equal(restore.statusCode, 303);
  assert.equal(f.models.Comment.rows[0].status, 'waiting');
  assert.equal((await f.core.comment.list({ path: '/p/synthetic/' }, { state: {}, headers: {} })).count, 0);
  assert.equal(f.updates(), 2);
});

test('routine moderation: second-page actions retain the selected queue and page', async () => {
  const f = await fixture({ rows: pending() });
  const path = '/__private?view=waiting&page=2';
  const home = await f.request(path, f.session);
  const result = await f.request('/__private', f.session, { csrf: csrf(home), objectId: ids(home.text)[0], action: 'spam', view: 'waiting', page: '2' });
  assert.equal(result.statusCode, 303);
  assert.equal(result.headers.location, path);
  assert.equal(ids((await f.request(path, f.session)).text).length, 4);
});

test('routine moderation: a drained final page returns safely to the remaining page', async () => {
  const f = await fixture({ rows: pending(21) });
  const path = '/__private?view=waiting&page=2';
  const home = await f.request(path, f.session);
  await f.request('/__private', f.session, { csrf: csrf(home), objectId: ids(home.text)[0], action: 'spam', view: 'waiting', page: '2' });
  const drained = await f.request(path, f.session);
  assert.equal(drained.statusCode, 303);
  assert.equal(drained.headers.location, '/__private?view=waiting&page=1');
  assert.equal(ids((await f.request(drained.headers.location, f.session)).text).length, 20);
});

test('routine moderation: malformed navigation and auth-route queries fail closed', async () => {
  const f = await fixture({ rows: pending(1) });
  for (const path of ['/__private?page=0', '/__private?page=-1', '/__private?page=1.5', '/__private?page=01', '/__private?page=10001', '/__private?page=1&page=2', '/__private?view=approved', '/__private?view=spam&view=waiting', '/__private?key=secret', '/__private?view=%ZZ', '/__private#fragment', '/__private/access?page=2', '/__private/login?view=spam']) {
    assert.ok([400,404].includes((await f.request(path, f.session)).statusCode), path);
  }
  assert.equal(f.updates(), 0);
});

test('routine moderation: unauthorized actions, bad CSRF and cross-origin requests cannot reject or restore', async () => {
  const f = await fixture({ rows: pending(1) });
  const home = await f.request('/__private', f.session);
  const body = { csrf: csrf(home), objectId: 'item0', action: 'spam' };
  assert.equal((await f.request('/__private', null, body)).statusCode, 403);
  assert.equal((await f.request('/__private', f.owner, body)).statusCode, 401);
  assert.equal((await f.request('/__private', f.session, { ...body, csrf: 'wrong' })).statusCode, 403);
  assert.equal((await f.request('/__private', f.session, body, { origin: 'https://evil.invalid' })).statusCode, 403);
  assert.equal((await f.request('/__private?view=waiting&page=2', f.session, body)).statusCode, 404);
  f.models.Users.rows[0].type = 'guest';
  assert.equal((await f.request('/__private', f.session, body)).statusCode, 401);
  assert.equal(f.updates(), 0);
});

test('routine moderation: action allowlist cannot delete, edit or publish rejected comments', async () => {
  const f = await fixture({ rows: [...pending(1), { ...pending(1)[0], objectId: 'spam1', status: 'spam' }, { ...pending(1)[0], objectId: 'public1', status: 'approved' }] });
  const home = await f.request('/__private', f.session);
  for (const [id, action, expected] of [['item0','delete',400],['item0','restore',409],['spam1','approve',409],['public1','spam',409],['public1','restore',409]]) {
    assert.equal((await f.request('/__private', f.session, { csrf: csrf(home), objectId: id, action })).statusCode, expected);
  }
  assert.equal(f.updates(), 0);
  assert.equal(f.models.Comment.rows.length, 3);
});

test('routine moderation: lost rejection result never retries and preserves reconciliation guidance', async () => {
  const f = await fixture({ rows: pending(1) });
  const home = await f.request('/__private', f.session);
  const update = f.models.Comment.update.bind(f.models.Comment);
  f.models.Comment.update = async (...args) => { await update(...args); throw Error('SYNTHETIC_DRIVER_SECRET'); };
  const result = await f.request('/__private', f.session, { csrf: csrf(home), objectId: 'item0', action: 'spam' });
  assert.equal(result.statusCode, 503);
  assert.match(result.text, /Do not submit/);
  assert.doesNotMatch(result.text, /SYNTHETIC_DRIVER_SECRET/);
  assert.equal(f.updates(), 1);
  assert.equal(f.models.Comment.rows[0].status, 'spam');
});

test('routine moderation: a concurrent status change cannot be overwritten by a stale approve action', async () => {
  const f = await fixture({ rows: pending(1) });
  const home = await f.request('/__private', f.session);
  const update = f.models.Comment.update.bind(f.models.Comment);
  f.models.Comment.update = async (data, where) => {
    f.models.Comment.rows[0].status = 'spam';
    assert.equal(where.status, 'waiting');
    return update(data, where);
  };
  const result = await f.request('/__private', f.session, { csrf: csrf(home), objectId: 'item0' });
  assert.equal(result.statusCode, 409);
  assert.equal(f.models.Comment.rows[0].status, 'spam');
});

test('routine moderation: path-limited acceptance cannot act outside its approved discussion', async () => {
  const f = await fixture({ rows: pending(1), paths: ['/p/other/'] });
  // A route-bound CSRF is obtained before changing the fixture row path.
  f.models.Comment.rows[0].url = '/p/other/';
  const home = await f.request('/__private', f.session);
  f.models.Comment.rows[0].url = '/p/synthetic/';
  assert.equal((await f.request('/__private', f.session, { csrf: csrf(home), objectId: 'item0', action: 'spam' })).statusCode, 403);
  assert.equal(f.updates(), 0);
});

test('routine moderation: expiration closes paginated reads and rejection alike', async t => {
  const now = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now });
  const f = await fixture({ rows: pending(1), expiresAt: now + 3600000 });
  const home = await f.request('/__private', f.session);
  t.mock.timers.setTime(now + 3600001);
  assert.equal((await f.request('/__private?view=spam&page=1', f.session)).statusCode, 403);
  assert.equal((await f.request('/__private', f.session, { csrf: csrf(home), objectId: 'item0', action: 'spam' })).statusCode, 403);
  assert.equal(f.updates(), 0);
});

test('routine moderation: exact empty/full page boundaries and spam pagination remain reachable', async () => {
  for (const n of [0, 20, 21, 40, 41]) {
    const f = await fixture({ rows: pending(n).map(row => ({ ...row, status: 'spam' })) });
    const found = [];
    const pages = Math.max(1, Math.ceil(n / 20));
    for (let page = 1; page <= pages; page++) {
      const response = await f.request('/__private?view=spam&page=' + page, f.session);
      assert.equal(response.statusCode, 200);
      found.push(...ids(response.text));
      assert.equal(response.text.includes('>Next page<'), page < pages);
    }
    assert.equal(found.length, n);
    assert.equal(new Set(found).size, n);
    assert.equal(f.updates(), 0);
  }
});

test('routine moderation: malformed return fields and extra mutation fields are rejected without writes', async () => {
  const f = await fixture({ rows: pending(1) });
  const home = await f.request('/__private', f.session);
  const base = { csrf: csrf(home), objectId: 'item0', action: 'spam' };
  for (const delta of [{ view: 'spam' }, { page: '1' }, { view: 'approved', page: '1' }, { view: 'waiting', page: '0' }, { view: 'waiting', page: '10001' }, { view: 'https://evil.invalid', page: '1' }, { comment: 'replaced' }, { status: 'approved' }]) {
    assert.equal((await f.request('/__private', f.session, { ...base, ...delta })).statusCode, 400);
  }
  assert.equal(f.updates(), 0);
});

test('routine moderation: rejected content is escaped and scoped acceptance fails closed on outsiders', async () => {
  const f = await fixture({ rows: [{ ...pending(1)[0], status: 'spam', nick: '<img onerror=evil()>', comment: '<script>evil()</script>', mail: 'SYNTHETIC_PRIVATE_MAIL', ip: 'SYNTHETIC_PRIVATE_IP' }] });
  const response = await f.request('/__private?view=spam&page=1', f.session);
  assert.equal(response.statusCode, 200);
  assert.match(response.text, /&lt;script&gt;evil\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(response.text, /<script>|<img|SYNTHETIC_PRIVATE_MAIL|SYNTHETIC_PRIVATE_IP/);
  const limited = await fixture({ rows: pending(1), paths: ['/p/other/'] });
  assert.equal((await limited.request('/__private', limited.session)).statusCode, 503);
  assert.equal(limited.updates(), 0);
  limited.models.Comment.rows[0].url = null;
  assert.equal((await limited.request('/__private', limited.session)).statusCode, 503);
});
