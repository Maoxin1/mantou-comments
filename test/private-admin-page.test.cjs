'use strict';
// Synthetic local HTTP fixtures only: no deployment, real account, or database.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const fs = require('node:fs');
const jwt = require('jsonwebtoken');
const { PasswordHash } = require('phpass');
const { MemoryModel } = require('./memory-model.cjs');

const ORIGIN = 'https://synthetic-private-fixture.vercel.app';
const OWNER_KEY = 'SYNTHETIC_OWNER_KEY_abcdefghijklmnopqrstuvwxyz_1234567890';
const JWT_SECRET = 'SYNTHETIC_SIGNING_KEY_ABCDEFGHIJKLMNOPQRSTUVWXYZ_9876543210';
const EMAIL = 'synthetic-owner@example.invalid';
const PASSWORD = 'Synthetic-only-password-123';
const OWNER_COOKIE = '__Host-mantou-owner';
const ADMIN_COOKIE = '__Host-mantou-admin';
const field = (html, name) => html.match(new RegExp('name="' + name + '" value="([^"]+)"'))?.[1];
const cookies = response => (response.headers['set-cookie'] || []).map(x => x.split(';')[0]).join('; ');
const tokenFrom = (cookie, name) => cookie.split('; ').find(x => x.startsWith(name + '='))?.slice(name.length + 1);

async function fixture(t, options = {}) {
  const models = { Users: new MemoryModel(options.rows || []), Comment: new MemoryModel(), Counter: new MemoryModel() };
  const calls = { models: 0, leases: 0, inserts: 0, disposed: 0 };
  const statements = [];
  let locked = false;
  const waiters = [];
  const acquireBootstrap = async () => {
    calls.leases++;
    let ownsLock = false;
    const release = () => {
      if (!ownsLock) return;
      ownsLock = false;
      if (waiters.length) waiters.shift()(); else locked = false;
    };
    return {
      client: {
        connection: { stream: { encrypted: true, authorized: true, getProtocol: () => 'TLSv1.3' } },
        async query(sql, values) {
          statements.push(sql);
          if (sql === 'SHOW transaction_read_only') return { rows: [{ transaction_read_only: 'off' }] };
          if (sql.startsWith('LOCK TABLE')) {
            if (locked) await new Promise(resolve => waiters.push(resolve)); else locked = true;
            ownsLock = true;
          }
          if (sql === 'SELECT id FROM public.wl_users LIMIT 1') return { rows: models.Users.rows.length ? [{ id: 1 }] : [] };
          if (sql.startsWith('INSERT')) {
            calls.inserts++;
            models.Users.rows.push({ objectId: '1', id: 1, email: values[0], display_name: values[1], password: values[2], type: 'administrator' });
            return { rows: [{ id: 1 }] };
          }
          if (sql === 'COMMIT' || sql === 'ROLLBACK') release();
          if (sql === 'COMMIT' && options.loseCommitReply) throw new Error('SYNTHETIC_COMMIT_REPLY_LOST');
          return { rows: [] };
        },
      },
      async dispose() { calls.disposed++; release(); },
    };
  };
  const config = {
    origin: ORIGIN, expiresAt: Date.now() + 3600000, identity: { email: EMAIL, displayName: 'Synthetic <Owner> & "Name"' },
    ownerAccessKey: OWNER_KEY, jwtSecret: JWT_SECRET,
    getModels: () => { calls.models++; return models; }, acquireBootstrap,
    ...options.config,
  };
  const handler = require('../src/private-admin-page.cjs').createPrivateAdminPage(config);
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  async function request(path, { method = 'GET', body, rawBody, headers = {} } = {}) {
    const encoded = rawBody === undefined ? (body === undefined ? undefined : new URLSearchParams(body).toString()) : rawBody;
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path, method,
        headers: {
          host: new URL(ORIGIN).host,
          ...(method === 'POST' ? { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' } : {}),
          ...(encoded === undefined ? {} : { 'content-length': Buffer.byteLength(encoded) }),
          ...headers,
        },
      }, res => {
        let text = '';
        res.setEncoding('utf8'); res.on('data', x => { text += x; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
      });
      req.on('error', reject); if (encoded !== undefined) req.write(encoded); req.end();
    });
  }
  const access = async () => {
    const response = await request('/__private/access', { method: 'POST', body: { ownerAccessKey: OWNER_KEY } });
    assert.equal(response.status, 303);
    return response.headers['set-cookie'].find(value => value.startsWith(OWNER_COOKIE + '=')).split(';')[0];
  };
  const form = async (path, cookie) => {
    const response = await request(path, { headers: { cookie } });
    assert.equal(response.status, 200);
    const csrf = field(response.text, 'csrf'); assert.ok(csrf);
    return csrf;
  };
  const setup = async cookie => request('/__private/setup', { method: 'POST', headers: { cookie },
    body: { csrf: await form('/__private/setup', cookie), password: PASSWORD, confirmPassword: PASSWORD } });
  const login = async (cookie, password = PASSWORD) => request('/__private/login', { method: 'POST', headers: { cookie },
    body: { csrf: await form('/__private/login', cookie), password } });
  return { request, access, form, setup, login, models, calls, statements, config };
}

test('private page: inert import and explicit separate configuration required', () => {
  const { createPrivateAdminPage } = require('../src/private-admin-page.cjs');
  for (const delta of [{}, { ownerAccessKey: 'short' }, { jwtSecret: OWNER_KEY }, { origin: 'http://unsafe.invalid' }, { origin: ORIGIN + '/path' }, { expiresAt: Date.now() - 1 }, { expiresAt: Date.now() + 90000000 }]) {
    const base = { origin: ORIGIN, expiresAt: Date.now() + 3600000, identity: { email: EMAIL, displayName: 'Synthetic Owner' }, ownerAccessKey: OWNER_KEY, jwtSecret: JWT_SECRET, getModels() {}, acquireBootstrap() {} };
    assert.throws(() => createPrivateAdminPage(Object.keys(delta).length ? { ...base, ...delta } : undefined), /configuration/i);
  }
  assert.doesNotMatch(fs.readFileSync(require.resolve('../index.cjs'), 'utf8'), /private-admin-page/);
  assert.doesNotMatch(fs.readFileSync(require.resolve('../src/private-admin-page.cjs'), 'utf8'), /process\.env/);
});

test('private page: access screen is escaped, script-free, no-store and has no account identity', async t => {
  const f = await fixture(t);
  const r = await f.request('/__private/access');
  assert.equal(r.status, 200); assert.equal(r.headers['cache-control'], 'no-store');
  assert.match(r.headers['content-security-policy'], /default-src 'none'/);
  assert.match(r.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.doesNotMatch(r.text, /<script|onclick=|Synthetic <Owner>|synthetic-owner@|SYNTHETIC_OWNER_KEY/);
  assert.equal(f.calls.models, 0); assert.equal(f.calls.leases, 0);
});

test('private page: unauthenticated password routes reject before reading input or models', async t => {
  const f = await fixture(t);
  for (const path of ['/__private/setup', '/__private/login', '/__private']) {
    for (const method of ['GET', 'POST']) {
      const r = await f.request(path, { method, body: method === 'POST' ? { password: PASSWORD } : undefined,
        headers: { authorization: 'Bearer forged', 'x-vercel-id': 'synthetic-owner', 'x-owner': 'true' } });
      assert.equal(r.status, 403);
    }
  }
  assert.deepEqual(f.calls, { models: 0, leases: 0, inserts: 0, disposed: 0 });
});

test('private page: owner key is POST-only, exact-origin and returns hardened cookie only', async t => {
  const f = await fixture(t);
  for (const headers of [{ origin: 'https://evil.invalid' }, { origin: 'null' }, { origin: '' }, { 'sec-fetch-site': 'cross-site' }, { host: 'alias.invalid' }]) {
    const r = await f.request('/__private/access', { method: 'POST', body: { ownerAccessKey: OWNER_KEY }, headers });
    assert.equal(r.status, 403); assert.equal(r.headers['set-cookie'], undefined);
  }
  assert.equal((await f.request('/__private/access?ownerAccessKey=' + OWNER_KEY)).status, 404);
  const wrong = await f.request('/__private/access', { method: 'POST', body: { ownerAccessKey: OWNER_KEY + 'x' } });
  assert.equal(wrong.status, 403);
  const r = await f.request('/__private/access', { method: 'POST', body: { ownerAccessKey: OWNER_KEY } });
  assert.equal(r.status, 303);
  const cookie = r.headers['set-cookie'].find(x => x.startsWith(OWNER_COOKIE + '='));
  assert.match(cookie, /Path=\/;.*HttpOnly;.*Secure;.*SameSite=Strict/);
  assert.match(cookie, /Max-Age=900/); assert.doesNotMatch(cookie, /Domain=/);
  assert.doesNotMatch(r.text, /eyJ|SYNTHETIC_/);
  assert.equal(f.calls.models, 0);
});

test('private page: malformed, duplicate, oversized and unsupported bodies cannot acquire models', async t => {
  const f = await fixture(t);
  for (const [rawBody, headers, status] of [
    ['ownerAccessKey=x&ownerAccessKey=y', {}, 400],
    ['ownerAccessKey=x&type=administrator', {}, 400],
    ['ownerAccessKey=%E0%A4%A', {}, 400],
    ['ownerAccessKey=' + 'x'.repeat(5000), {}, 413],
    ['{}', { 'content-type': 'application/json' }, 415],
  ]) assert.equal((await f.request('/__private/access', { method: 'POST', rawBody, headers })).status, status);
  assert.equal(f.calls.models, 0); assert.equal(f.calls.leases, 0);
});

test('private page: tampered, expired, wrong algorithm/purpose and duplicate owner cookies fail closed', async t => {
  const f = await fixture(t); const owner = await f.access();
  const token = tokenFrom(owner, OWNER_COOKIE); const payload = jwt.decode(token);
  const variants = [
    token.slice(0, -8) + 'tampered',
    jwt.sign({ ...payload, exp: Math.floor(Date.now() / 1000) - 1 }, JWT_SECRET, { algorithm: 'HS256' }),
    jwt.sign({ ...payload, purpose: 'admin' }, JWT_SECRET, { algorithm: 'HS256' }),
    jwt.sign(payload, JWT_SECRET, { algorithm: 'HS384' }),
    jwt.sign({ ...payload, iss: 'https://evil.invalid' }, JWT_SECRET, { algorithm: 'HS256' }),
  ];
  for (const value of variants) assert.equal((await f.request('/__private/setup', { headers: { cookie: OWNER_COOKIE + '=' + value } })).status, 403);
  assert.equal((await f.request('/__private/setup', { headers: { cookie: owner + '; ' + owner } })).status, 403);
  assert.equal(f.calls.models, 0); assert.equal(f.calls.leases, 0);
});

test('private page: setup identity is escaped and server-bound, CSRF rejects route and owner replay', async t => {
  const f = await fixture(t); const owner = await f.access();
  const form = await f.request('/__private/setup', { headers: { cookie: owner } });
  assert.match(form.text, /Synthetic &lt;Owner&gt; &amp; &quot;Name&quot;/);
  assert.doesNotMatch(form.text, /name="email"|name="displayName"|<Owner>/);
  const csrf = field(form.text, 'csrf');
  const common = { password: PASSWORD, confirmPassword: PASSWORD };
  for (const body of [common, { ...common, csrf: 'bad' }, { ...common, csrf, email: 'forged@example.invalid' }, { ...common, csrf, type: 'administrator' }, { ...common, csrf, displayName: 'forged' }]) {
    assert.ok([400, 403].includes((await f.request('/__private/setup', { method: 'POST', headers: { cookie: owner }, body })).status));
  }
  const other = await f.access();
  assert.equal((await f.request('/__private/setup', { method: 'POST', headers: { cookie: other }, body: { ...common, csrf } })).status, 403);
  assert.equal((await f.request('/__private/login', { method: 'POST', headers: { cookie: owner }, body: { password: PASSWORD, csrf } })).status, 403);
  assert.equal(f.calls.leases, 0); assert.equal(f.calls.models, 1);
});

test('private page: real bootstrap and core login work over HTTP and role/email are reread', async t => {
  const f = await fixture(t); const owner = await f.access();
  const created = await f.setup(owner);
  assert.equal(created.status, 303); assert.equal(created.headers.location, '/__private/login');
  assert.equal(f.calls.inserts, 1); assert.equal(f.models.Users.rows[0].email, EMAIL);
  assert.match(f.models.Users.rows[0].password, /^\$2[aby]\$10\$/);
  const bad = await f.login(owner, 'Incorrect-synthetic-password');
  assert.equal(bad.status, 401); assert.equal(bad.headers['set-cookie'], undefined);
  const loggedIn = await f.login(owner); assert.equal(loggedIn.status, 303);
  const adminCookie = cookies(loggedIn); const session = owner + '; ' + adminCookie;
  assert.ok(tokenFrom(adminCookie, ADMIN_COOKIE)); assert.doesNotMatch(loggedIn.text, /eyJ|Synthetic-only-password/);
  const page = await f.request('/__private', { headers: { cookie: session } });
  assert.equal(page.status, 200); assert.match(page.text, /Signed in/);
  assert.equal((await f.request('/__private', { headers: { cookie: adminCookie } })).status, 403);
  assert.equal((await f.request('/__private', { headers: { cookie: owner, authorization: 'Bearer ' + tokenFrom(adminCookie, ADMIN_COOKIE) } })).status, 401);
  f.models.Users.rows[0].type = 'guest';
  assert.equal((await f.request('/__private', { headers: { cookie: session } })).status, 401);
  f.models.Users.rows[0].type = 'administrator'; f.models.Users.rows[0].email = 'other@example.invalid';
  assert.equal((await f.request('/__private', { headers: { cookie: session } })).status, 401);
});

test('private page: repeated and concurrent setup cannot overwrite or create a second administrator', async t => {
  const f = await fixture(t); const owner = await f.access(); const csrf = await f.form('/__private/setup', owner);
  const send = () => f.request('/__private/setup', { method: 'POST', headers: { cookie: owner }, body: { csrf, password: PASSWORD, confirmPassword: PASSWORD } });
  assert.deepEqual((await Promise.all([send(), send()])).map(x => x.status).sort(), [303, 409]);
  const saved = structuredClone(f.models.Users.rows);
  assert.equal((await send()).status, 409); assert.deepEqual(f.models.Users.rows, saved);
  assert.equal(f.calls.inserts, 1); assert.equal(f.calls.disposed, 3);
  const closed = await f.request('/__private/setup', { headers: { cookie: owner } });
  assert.equal(closed.status, 409); assert.doesNotMatch(closed.text, /name="password"|name="confirmPassword"|Create administrator/);
});

test('private page: missing/mismatched/invalid password never starts bootstrap storage', async t => {
  const f = await fixture(t); const owner = await f.access(); const csrf = await f.form('/__private/setup', owner);
  for (const [password, confirmPassword] of [['short', 'short'], [PASSWORD, 'different'], ['界'.repeat(25), '界'.repeat(25)], ['password\0with-null', 'password\0with-null']]) {
    const r = await f.request('/__private/setup', { method: 'POST', headers: { cookie: owner }, body: { csrf, password, confirmPassword } });
    assert.equal(r.status, 400);
  }
  assert.equal(f.calls.leases, 0);
});

test('private page: guest, banned and two-factor accounts cannot produce an admin cookie', async t => {
  const hash = await new PasswordHash().hashPasswordAsync(PASSWORD);
  for (const extra of [{ type: 'guest' }, { type: 'banned' }, { type: 'administrator', '2fa': 'SYNTHETIC_2FA_ONLY' }]) {
    const f = await fixture(t, { rows: [{ objectId: '1', email: EMAIL, password: hash, ...extra }] });
    const r = await f.login(await f.access());
    assert.equal(r.status, 401); assert.equal(r.headers['set-cookie'], undefined);
  }
});

test('private page: admin token is owner-bound, purpose-bound and tamper resistant', async t => {
  const f = await fixture(t); const owner = await f.access(); await f.setup(owner);
  const loggedIn = await f.login(owner); const admin = cookies(loggedIn); const token = tokenFrom(admin, ADMIN_COOKIE);
  assert.equal((await f.request('/__private', { headers: { cookie: await f.access() + '; ' + admin } })).status, 401);
  const payload = jwt.decode(token);
  for (const changed of [{ purpose: 'owner' }, { exp: Math.floor(Date.now() / 1000) - 1 }, { aud: 'https://evil.invalid' }]) {
    const forged = jwt.sign({ ...payload, ...changed }, JWT_SECRET, { algorithm: 'HS256' });
    assert.equal((await f.request('/__private', { headers: { cookie: owner + '; ' + ADMIN_COOKIE + '=' + forged } })).status, 401);
  }
  assert.equal((await f.request('/__private', { headers: { cookie: owner + '; ' + ADMIN_COOKIE + '=' + token.slice(0, -8) + 'tampered' } })).status, 401);
});

test('private page: logout requires CSRF and clears both secure cookies', async t => {
  // This verifies browser cookie clearing, not server revocation of copied
  // stateless tokens. Copies expire with their short/absolute time bounds.
  const f = await fixture(t); const owner = await f.access(); await f.setup(owner);
  const cookie = owner + '; ' + cookies(await f.login(owner));
  assert.equal((await f.request('/__private/logout', { method: 'POST', headers: { cookie }, body: { csrf: 'bad' } })).status, 403);
  const csrf = await f.form('/__private', cookie);
  const r = await f.request('/__private/logout', { method: 'POST', headers: { cookie }, body: { csrf } });
  assert.equal(r.status, 303); assert.equal(r.headers.location, '/__private/access');
  assert.equal(r.headers['set-cookie'].length, 2);
  for (const value of r.headers['set-cookie']) assert.match(value, /Max-Age=0;.*HttpOnly;.*Secure;.*SameSite=Strict/);
});

test('private page: private errors are generic and no signup/OAuth/reset route exists', async t => {
  const f = await fixture(t, { config: {
    getModels: () => { throw Error('SYNTHETIC_DATABASE_SECRET private-db-host'); },
    acquireBootstrap: () => { throw Error('SYNTHETIC_DATABASE_SECRET private-db-host'); },
  } });
  const owner = await f.access();
  const csrf = await f.form('/__private/login', owner);
  const setupForm = await f.request('/__private/setup', { headers: { cookie: owner } });
  for (const r of [setupForm, await f.request('/__private/login', { method: 'POST', headers: { cookie: owner }, body: { csrf, password: PASSWORD } })]) {
    assert.equal(r.status, 503); assert.doesNotMatch(r.text, /SYNTHETIC_DATABASE_SECRET|private-db-host|Synthetic-only-password|stack/i);
  }
  for (const path of ['/api/user', '/api/oauth', '/__private/signup', '/__private/reset', '/__private/%6cogin', '/__private/login?password=foo']) {
    assert.equal((await f.request(path, { headers: { cookie: owner } })).status, 404);
  }
});

test('private page: absolute retirement rejects owner keys and existing cookies without storage', async t => {
  const now = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now });
  const f = await fixture(t, { config: { expiresAt: now + 60000 } });
  const owner = await f.access();
  const payload = jwt.decode(tokenFrom(owner, OWNER_COOKIE));
  assert.ok(payload.exp <= Math.floor((now + 60000) / 1000));
  t.mock.timers.setTime(now + 60001);
  for (const path of ['/__private/access', '/__private/setup', '/__private/login', '/__private']) {
    for (const method of ['GET', 'POST']) {
      const r = await f.request(path, { method, headers: { cookie: owner }, body: method === 'POST' ? { ownerAccessKey: OWNER_KEY } : undefined });
      assert.equal(r.status, 403); assert.equal(r.headers['set-cookie'], undefined);
    }
  }
  assert.deepEqual(f.calls, { models: 0, leases: 0, inserts: 0, disposed: 0 });
});

test('private page: missing owner proof never consumes the password request stream', async t => {
  const f = await fixture(t);
  const handler = require('../src/private-admin-page.cjs').createPrivateAdminPage(f.config);
  let reads = 0;
  const req = { method: 'POST', url: '/__private/setup', headers: {
    host: new URL(ORIGIN).host, origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded', 'content-length': '100',
  }, async *[Symbol.asyncIterator]() { reads++; yield Buffer.from('password=' + PASSWORD); } };
  const res = { setHeader() {}, end() {} };
  await handler(req, res);
  assert.equal(res.statusCode, 403); assert.equal(reads, 0);
  assert.deepEqual(f.calls, { models: 0, leases: 0, inserts: 0, disposed: 0 });
});

test('private page: real pinned authentication and setup make no fetch or mail attempts', async t => {
  const nodemailer = require('nodemailer');
  const oldFetch = global.fetch; const oldTransport = nodemailer.createTransport;
  let fetches = 0, transports = 0;
  global.fetch = async () => { fetches++; throw new Error('FORBIDDEN_SYNTHETIC_FETCH'); };
  nodemailer.createTransport = () => { transports++; throw new Error('FORBIDDEN_SYNTHETIC_MAIL'); };
  t.after(() => { global.fetch = oldFetch; nodemailer.createTransport = oldTransport; });
  const f = await fixture(t); const owner = await f.access();
  assert.equal((await f.setup(owner)).status, 303);
  const session = owner + '; ' + cookies(await f.login(owner));
  assert.equal((await f.request('/__private', { headers: { cookie: session } })).status, 200);
  assert.equal(fetches, 0); assert.equal(transports, 0);
});

test('private page: bootstrap lease errors do not reveal storage details or password', async t => {
  const f = await fixture(t, { config: { acquireBootstrap: () => { throw Error('SYNTHETIC_DATABASE_SECRET private-db-host'); } } });
  const r = await f.setup(await f.access());
  assert.equal(r.status, 503);
  assert.match(r.text, /Do not submit setup again until an authorized read-only account check resolves the outcome/);
  assert.doesNotMatch(r.text, /SYNTHETIC_DATABASE_SECRET|private-db-host|Synthetic-only-password|stack/i);
});

test('private page: POST framing and bounded stream reject before login or bootstrap models', async t => {
  const f = await fixture(t); const cookie = await f.access();
  const handler = require('../src/private-admin-page.cjs').createPrivateAdminPage(f.config);
  for (const [headerDelta, chunks, status] of [
    [{ 'transfer-encoding': 'chunked' }, ['a'], 400],
    [{ 'content-length': undefined }, ['a'], 400],
    [{ 'content-length': '1' }, ['x'.repeat(5000)], 413],
    [{ 'content-length': '2' }, ['a'], 400],
    [{ 'content-length': '1' }, [Buffer.from([0xff])], 400],
  ]) {
    const req = { method: 'POST', url: '/__private/login', headers: {
      host: new URL(ORIGIN).host, origin: ORIGIN, cookie, 'content-type': 'application/x-www-form-urlencoded', 'content-length': '1', ...headerDelta,
    }, async *[Symbol.asyncIterator]() { for (const chunk of chunks) yield Buffer.from(chunk); } };
    const res = { setHeader() {}, end() {} };
    await handler(req, res); assert.equal(res.statusCode, status);
  }
  assert.deepEqual(f.calls, { models: 0, leases: 0, inserts: 0, disposed: 0 });
});

test('private page: stalled synthetic request stream stops at the body-read deadline', async t => {
  const f = await fixture(t); const cookie = await f.access();
  const handler = require('../src/private-admin-page.cjs').createPrivateAdminPage(f.config);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const req = { method: 'POST', url: '/__private/login', headers: {
    host: new URL(ORIGIN).host, origin: ORIGIN, cookie, 'content-type': 'application/x-www-form-urlencoded', 'content-length': '100',
  }, async *[Symbol.asyncIterator]() { await new Promise(() => {}); } };
  const headers = {};
  const res = { setHeader(name, value) { headers[name] = value; }, end() {} };
  const pending = handler(req, res);
  t.mock.timers.tick(5001);
  await pending;
  assert.equal(res.statusCode, 408); assert.equal(headers.connection, 'close');
  assert.deepEqual(f.calls, { models: 0, leases: 0, inserts: 0, disposed: 0 });
});

test('private page: lost COMMIT reply never retries or issues an admin cookie, and later login resolves persisted creation', async t => {
  const f = await fixture(t, { loseCommitReply: true });
  const owner = await f.access();
  const result = await f.setup(owner);
  assert.equal(result.status, 503);
  assert.equal(result.headers['set-cookie'], undefined);
  assert.match(result.text, /Do not submit setup again until an authorized read-only account check resolves the outcome/);
  assert.doesNotMatch(result.text, /SYNTHETIC_COMMIT_REPLY_LOST|Synthetic-only-password|eyJ/);
  assert.equal(f.calls.inserts, 1);
  assert.equal(f.calls.leases, 1);
  assert.equal(f.calls.disposed, 1);
  assert.equal(f.statements.filter(sql => sql === 'COMMIT').length, 1);
  assert.equal(f.statements.includes('ROLLBACK'), false);
  assert.equal(f.models.Users.rows.length, 1);
  const login = await f.login(owner);
  assert.equal(login.status, 303);
  const session = owner + '; ' + cookies(login);
  assert.ok(tokenFrom(cookies(login), ADMIN_COOKIE));
  assert.equal((await f.request('/__private', { headers: { cookie: session } })).status, 200);
  assert.equal(f.calls.inserts, 1);
  assert.equal(f.statements.filter(sql => sql === 'COMMIT').length, 1);
});
