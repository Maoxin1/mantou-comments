'use strict';
// Synthetic in-process fixtures only: no real environment, socket, or database.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Module = require('node:module');
const { spawnSync } = require('node:child_process');
const { createStagedPrivateAdmin } = require('../deployment/staged-private-admin.cjs');

const OWNER_KEY = 'SYNTHETIC_SECRET_OWNER_abcdefghijklmnopqrstuvwxyz_1234567890';
const SIGNING_KEY = 'SYNTHETIC_SECRET_SIGNING_ABCDEFGHIJKLMNOPQRSTUVWXYZ_9876543210';
const CHECKS = new Set([
  'environment_present', 'helpers_disabled', 'production', 'project_matches',
  'private_enabled', 'generated_url_valid', 'host_matches', 'method_allowed',
  'path_allowed', 'expiry_format', 'expiry_future', 'expiry_within_24h',
  'identity_email_shape', 'identity_name_shape', 'owner_key_shape',
  'signing_key_shape', 'keys_distinct', 'adapter_module_loaded',
  'page_module_loaded', 'adapter_created', 'page_created',
]);
const PHASES = new Set(['guard', 'expiry', 'adapter_module', 'page_module', 'adapter_factory', 'page_factory', 'dispatch', 'ready']);
const ROUTE_CLASSES = new Set(['access', 'setup', 'login', 'home', 'logout', 'function_endpoint', 'query_attached', 'trailing_slash', 'other']);
function environment(delta = {}) {
  return {
    NODEJS_HELPERS: '0', VERCEL_ENV: 'production',
    VERCEL_PROJECT_ID: 'prj_NtBPfOSSwqaOLH0tejtx7Da5eE9Q',
    VERCEL_URL: 'mantou-comments-synthetic-mantous-projects-af7e7067.vercel.app',
    PRIVATE_ADMIN_ENABLED: 'true', PRIVATE_ADMIN_EMAIL: 'synthetic-owner@example.invalid',
    PRIVATE_ADMIN_DISPLAY_NAME: 'Synthetic Owner', PRIVATE_ADMIN_ACCESS_KEY: OWNER_KEY,
    JWT_TOKEN: SIGNING_KEY,
    PRIVATE_ADMIN_EXPIRES_AT: new Date(Math.floor((Date.now() + 3600000) / 1000) * 1000).toISOString(),
    ...delta,
  };
}
function response() {
  return { statusCode: 200, headers: {}, headersSent: false, writableEnded: false,
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = value; this.headersSent = true; this.writableEnded = true; },
  };
}
function request(env, delta = {}) {
  const req = {
    method: 'GET', url: '/__private/access',
    headers: { host: env?.VERCEL_URL, cookie: 'SYNTHETIC_SECRET_COOKIE', authorization: 'SYNTHETIC_SECRET_HEADER' },
    async *[Symbol.asyncIterator]() { throw Error('SYNTHETIC_SECRET_BODY_READ'); },
    ...delta,
  };
  Object.defineProperty(req, 'body', { get() { throw Error('SYNTHETIC_SECRET_BODY_PROPERTY_READ'); } });
  return req;
}
function fixture(env = environment(), dependencies = {}) {
  const events = [];
  const calls = { adapters: 0, pages: 0, dispatches: 0, storage: 0 };
  const adapter = {
    getModels() { calls.storage++; throw Error('SYNTHETIC_SECRET_STORAGE'); },
    acquireBootstrap() { calls.storage++; throw Error('SYNTHETIC_SECRET_STORAGE'); },
  };
  const handler = createStagedPrivateAdmin(env, {
    createAdapter() { calls.adapters++; return adapter; },
    createPage() { calls.pages++; return async (_req, res) => { calls.dispatches++; res.end('synthetic page'); }; },
    reportStartup(event) { events.push(event); },
    ...dependencies,
  });
  return { events, calls, adapter, handler, env };
}
function inspectEvent(events, expected = {}) {
  assert.equal(events.length, 1, 'exactly one startup event is emitted');
  const event = events[0];
  assert.deepEqual(Object.keys(event).sort(), ['checks', 'event', 'outcome', 'phase', 'routeClass', 'version']);
  assert.equal(event.event, 'mantou_private_startup');
  assert.equal(event.version, 1);
  assert.ok(PHASES.has(event.phase));
  assert.ok(['blocked', 'error', 'ready'].includes(event.outcome));
  assert.ok(ROUTE_CLASSES.has(event.routeClass));
  assert.ok(event.checks && typeof event.checks === 'object' && !Array.isArray(event.checks));
  for (const [name, value] of Object.entries(event.checks)) {
    assert.ok(CHECKS.has(name), 'only fixed check names may be emitted: ' + name);
    assert.equal(typeof value, 'boolean', 'check values are booleans');
  }
  for (const [key, value] of Object.entries(expected)) assert.equal(event[key], value, key);
  assert.doesNotMatch(JSON.stringify(event), /SYNTHETIC_SECRET|synthetic-owner|example\.invalid|vercel\.app|prj_|Synthetic Owner|2099|stack|password|cookie|authorization/i);
  return event;
}
function assertDisabled(res) {
  assert.equal(res.statusCode, 503);
  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.deepEqual(JSON.parse(res.body), { errno: 503, errmsg: 'Comments are not enabled' });
}

test('private startup: import and handler construction are silent and do not inspect environment properties', () => {
  let reads = 0, reports = 0;
  const env = new Proxy({}, { get() { reads++; throw Error('SYNTHETIC_SECRET_ENV_READ'); } });
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../deployment/staged-private-admin.cjs'), 'utf8'), {
    module, exports: module.exports, process: { env }, console: { info() { reports++; } },
    require(name) { assert.equal(name, '../index.cjs'); return require('../index.cjs'); },
  });
  assert.equal(typeof module.exports, 'function');
  assert.equal(typeof module.exports.createStagedPrivateAdmin(env, { reportStartup() { reports++; } }), 'function');
  assert.equal(reads, 0);
  assert.equal(reports, 0);
});

test('private startup: successful dispatch emits only sanitized booleans once per warm handler', async () => {
  const f = fixture();
  for (let i = 0; i < 3; i++) {
    const res = response();
    await f.handler(request(f.env), res);
    assert.equal(res.body, 'synthetic page');
  }
  const event = inspectEvent(f.events, { phase: 'ready', outcome: 'ready', routeClass: 'access' });
  for (const key of ['environment_present', 'host_matches', 'path_allowed', 'expiry_format', 'expiry_future', 'expiry_within_24h', 'identity_email_shape', 'identity_name_shape', 'owner_key_shape', 'signing_key_shape', 'keys_distinct', 'adapter_created', 'page_created']) assert.equal(event.checks[key], true, key);
  assert.deepEqual(f.calls, { adapters: 1, pages: 1, dispatches: 3, storage: 0 });
});

test('private startup: independent cold handlers each report once', async () => {
  const a = fixture(), b = fixture();
  await a.handler(request(a.env), response());
  await b.handler(request(b.env), response());
  inspectEvent(a.events, { phase: 'ready' });
  inspectEvent(b.events, { phase: 'ready' });
});

test('private startup: guard failures keep the exact disabled response without constructing dependencies', async () => {
  const cases = [
    [null, 'environment_present'],
    [environment({ NODEJS_HELPERS: '1' }), 'helpers_disabled'],
    [environment({ VERCEL_ENV: 'preview' }), 'production'],
    [environment({ VERCEL_PROJECT_ID: 'SYNTHETIC_SECRET_PROJECT' }), 'project_matches'],
    [environment({ PRIVATE_ADMIN_ENABLED: 'false' }), 'private_enabled'],
    [environment({ VERCEL_URL: 'SYNTHETIC_SECRET_HOST.invalid' }), 'generated_url_valid'],
  ];
  for (const [env, failedCheck] of cases) {
    const f = fixture(env), res = response();
    await f.handler(request(env), res);
    assertDisabled(res);
    const event = inspectEvent(f.events, { phase: 'guard', outcome: 'blocked' });
    assert.equal(event.checks[failedCheck], false, failedCheck);
    assert.equal('expiry_format' in event.checks, false);
    assert.equal('adapter_created' in event.checks, false);
    assert.deepEqual(f.calls, { adapters: 0, pages: 0, dispatches: 0, storage: 0 });
  }
});

test('private startup: guard diagnostics preserve short circuit reads and omit unexecuted checks', async () => {
  let reads = 0;
  const env = new Proxy({ NODEJS_HELPERS: '1' }, { get(target, property) {
    if (property !== 'NODEJS_HELPERS') { reads++; throw Error('SYNTHETIC_SECRET_UNEXECUTED_READ'); }
    return target[property];
  } });
  const f = fixture(env), res = response();
  await f.handler(request(undefined), res);
  assertDisabled(res);
  assert.equal(reads, 0);
  const event = inspectEvent(f.events, { phase: 'guard', outcome: 'blocked' });
  assert.deepEqual(event.checks, { environment_present: true, helpers_disabled: false });
});

test('private startup: host and method mismatches remain guarded and body-free', async () => {
  for (const [delta, failedCheck] of [[{ headers: { host: 'SYNTHETIC_SECRET_HOST.invalid' } }, 'host_matches'], [{ method: 'DELETE' }, 'method_allowed']]) {
    const f = fixture(), res = response();
    await f.handler(request(f.env, delta), res);
    assertDisabled(res);
    const event = inspectEvent(f.events, { phase: 'guard', outcome: 'blocked' });
    assert.equal(event.checks[failedCheck], false);
    assert.equal(f.calls.adapters, 0);
  }
});

test('private startup: unexpected rewritten and decorated paths use fixed route classes', async () => {
  for (const [url, routeClass] of [
    ['/api/private-admin', 'function_endpoint'],
    ['/__private/access?key=SYNTHETIC_SECRET_QUERY', 'query_attached'],
    ['/__private/access/', 'trailing_slash'],
    ['/SYNTHETIC_SECRET_UNKNOWN_PATH', 'other'],
  ]) {
    const f = fixture(), res = response();
    await f.handler(request(f.env, { url }), res);
    assertDisabled(res);
    const event = inspectEvent(f.events, { phase: 'guard', outcome: 'blocked', routeClass });
    assert.equal(event.checks.path_allowed, false);
    assert.equal(f.calls.adapters, 0);
  }
});

test('private startup: every allowed path has a fixed route class without logging its raw URL', async () => {
  for (const [url, routeClass] of [['/__private/access', 'access'], ['/__private/setup', 'setup'], ['/__private/login', 'login'], ['/__private', 'home'], ['/__private/logout', 'logout']]) {
    const f = fixture();
    await f.handler(request(f.env, { url }), response());
    inspectEvent(f.events, { phase: 'ready', outcome: 'ready', routeClass });
  }
});

test('private startup: invalid expiry strings block before loading or creating dependencies', async () => {
  for (const value of ['', 'SYNTHETIC_SECRET_EXPIRY', '2099-02-31T00:00:00Z', '2099-01-01T00:00:00+09:00']) {
    const f = fixture(environment({ PRIVATE_ADMIN_EXPIRES_AT: value })), res = response();
    await f.handler(request(f.env), res);
    assertDisabled(res);
    const event = inspectEvent(f.events, { phase: 'expiry', outcome: 'blocked' });
    assert.equal(event.checks.expiry_format, false);
    assert.equal('expiry_future' in event.checks, false);
    assert.equal('adapter_created' in event.checks, false);
    assert.equal(f.calls.adapters, 0);
  }
});

test('private startup: module loading failures identify the stage without exposing errors', async t => {
  const originalLoad = Module._load;
  for (const [moduleName, phase] of [['../src/private-postgresql-adapter.cjs', 'adapter_module'], ['../src/private-admin-page.cjs', 'page_module']]) {
    const mocked = t.mock.method(Module, '_load', function (name, ...args) {
      if (name === moduleName) throw Error('SYNTHETIC_SECRET_MODULE_PATH /private/server/stack');
      return originalLoad.call(this, name, ...args);
    });
    try {
      const f = fixture(environment(), phase === 'adapter_module' ? { createAdapter: undefined } : { createPage: undefined });
      const res = response();
      await f.handler(request(f.env), res);
      assertDisabled(res);
      inspectEvent(f.events, { phase, outcome: 'error' });
      assert.equal(f.calls.storage, 0);
    } finally { mocked.mock.restore(); }
  }
});

test('private startup: adapter, page, and dispatch exceptions are classified and sanitized', async () => {
  const fail = () => { throw Error('SYNTHETIC_SECRET_EXCEPTION postgres://private@example.invalid/secret'); };
  for (const [dependencies, phase] of [
    [{ createAdapter: fail }, 'adapter_factory'],
    [{ createPage: fail }, 'page_factory'],
    [{ createPage: () => async () => fail() }, 'dispatch'],
  ]) {
    const f = fixture(environment(), dependencies), res = response();
    await f.handler(request(f.env), res);
    assertDisabled(res);
    inspectEvent(f.events, { phase, outcome: 'error' });
    assert.equal(f.calls.storage, 0);
  }
});

test('private startup: a first guard failure is the only event even when a later request succeeds', async () => {
  const f = fixture(), bad = response(), good = response();
  await f.handler(request(f.env, { url: '/api/private-admin' }), bad);
  const first = JSON.stringify(f.events);
  await f.handler(request(f.env), good);
  assertDisabled(bad);
  assert.equal(good.body, 'synthetic page');
  inspectEvent(f.events, { phase: 'guard', outcome: 'blocked', routeClass: 'function_endpoint' });
  assert.equal(JSON.stringify(f.events), first, 'later requests must not mutate the saved event');
});

test('private startup: concurrent requests emit exactly one startup event', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const f = fixture(environment(), { createPage: () => async (_req, res) => { await pending; res.end('synthetic concurrent page'); } });
  const a = response(), b = response();
  const requests = [f.handler(request(f.env), a), f.handler(request(f.env), b)];
  release();
  await Promise.all(requests);
  assert.equal(a.body, 'synthetic concurrent page');
  assert.equal(b.body, 'synthetic concurrent page');
  inspectEvent(f.events, { phase: 'ready', outcome: 'ready' });
});

test('private startup: a throwing reporter never changes ready or disabled responses and is not retried', async () => {
  for (const url of ['/__private/access', '/api/private-admin']) {
    let reports = 0;
    const f = fixture(environment(), { reportStartup() { reports++; throw Error('SYNTHETIC_SECRET_REPORTER'); } });
    for (let i = 0; i < 2; i++) {
      const res = response();
      await f.handler(request(f.env, { url }), res);
      if (url === '/api/private-admin') assertDisabled(res);
      else assert.equal(res.body, 'synthetic page');
    }
    assert.equal(reports, 1);
  }
});

test('private startup: the default reporter emits one JSON string to console.info', async t => {
  const lines = [];
  t.mock.method(console, 'info', (...args) => { assert.equal(args.length, 1); lines.push(args[0]); });
  const f = fixture(environment(), { reportStartup: undefined });
  await f.handler(request(f.env), response());
  await f.handler(request(f.env), response());
  assert.equal(lines.length, 1);
  assert.equal(typeof lines[0], 'string');
  inspectEvent([JSON.parse(lines[0])], { phase: 'ready', outcome: 'ready' });
});

test('private startup: rejected async reporters cannot crash the process or print raw errors', () => {
  // Use an isolated process so an unhandled rejection cannot contaminate the
  // test runner. The child receives an empty OS environment and synthetic data.
  const script = `
    'use strict';
    const assert = require('node:assert/strict');
    const { createStagedPrivateAdmin } = require(${JSON.stringify(require.resolve('../deployment/staged-private-admin.cjs'))});
    const environment = ${JSON.stringify(environment())};
    (async () => {
      for (const url of ['/__private/access', '/api/private-admin']) {
        let reports = 0;
        const handler = createStagedPrivateAdmin(environment, {
          createAdapter() { return {}; },
          createPage() { return async (_req, res) => { res.end('synthetic page'); }; },
          async reportStartup() { reports++; throw Error('SYNTHETIC_SECRET_ASYNC_REPORTER'); },
        });
        for (let i = 0; i < 2; i++) {
          const res = { statusCode: 200, setHeader() {}, end(body) { this.body = body; } };
          await handler({ method: 'GET', url, headers: { host: environment.VERCEL_URL } }, res);
          if (url === '/api/private-admin') {
            assert.equal(res.statusCode, 503);
            assert.deepEqual(JSON.parse(res.body), { errno: 503, errmsg: 'Comments are not enabled' });
          } else {
            assert.equal(res.statusCode, 200);
            assert.equal(res.body, 'synthetic page');
          }
        }
        assert.equal(reports, 1);
        await new Promise(resolve => setImmediate(resolve));
      }
      console.log('async reporter isolation passed');
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `;
  const result = spawnSync(process.execPath, ['--unhandled-rejections=strict', '-e', script], {
    env: {}, encoding: 'utf8', timeout: 5000, maxBuffer: 65536,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, 'an async reporter rejection must not terminate the process');
  assert.equal(result.stdout.trim(), 'async reporter isolation passed');
  assert.equal(result.stderr, '', 'reporter errors and stacks must not escape to stderr');
});

test('private startup: real page returns the access HTML without consuming body or invoking storage callbacks', async () => {
  const createPage = require('../src/private-admin-page.cjs').createPrivateAdminPage;
  const f = fixture(environment(), { createPage }), res = response();
  await f.handler(request(f.env), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
  assert.match(res.body, /Private administrator access/);
  assert.doesNotMatch(res.body, /SYNTHETIC_SECRET|synthetic-owner@example/);
  assert.equal(f.calls.storage, 0);
  inspectEvent(f.events, { phase: 'ready', outcome: 'ready', routeClass: 'access' });
});

test('private startup: reporting never consumes an unauthenticated password POST or invokes storage', async () => {
  const createPage = require('../src/private-admin-page.cjs').createPrivateAdminPage;
  for (const url of ['/__private/setup', '/__private/login']) {
    const f = fixture(environment(), { createPage }), res = response();
    let bodyReads = 0;
    const req = request(f.env, {
      method: 'POST', url,
      headers: { host: f.env.VERCEL_URL, origin: 'https://' + f.env.VERCEL_URL,
        'content-type': 'application/x-www-form-urlencoded', 'content-length': '100',
      },
      async *[Symbol.asyncIterator]() { bodyReads++; yield Buffer.from('password=SYNTHETIC_SECRET_PASSWORD'); },
    });
    await f.handler(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(bodyReads, 0);
    assert.equal(f.calls.storage, 0);
    inspectEvent(f.events, { phase: 'ready', outcome: 'ready', routeClass: url.endsWith('setup') ? 'setup' : 'login' });
  }
});

test('private startup: shape checks diagnose real page-constructor failures without bypassing validation', async () => {
  const realCreatePage = require('../src/private-admin-page.cjs').createPrivateAdminPage;
  const cases = [
    [{ PRIVATE_ADMIN_EMAIL: 'SYNTHETIC_SECRET_INVALID_EMAIL' }, 'identity_email_shape'],
    [{ PRIVATE_ADMIN_DISPLAY_NAME: 'SYNTHETIC_SECRET_NAME\n' }, 'identity_name_shape'],
    [{ PRIVATE_ADMIN_ACCESS_KEY: 'SYNTHETIC_SECRET_SHORT' }, 'owner_key_shape'],
    [{ JWT_TOKEN: 'SYNTHETIC_SECRET_SHORT' }, 'signing_key_shape'],
    [{ PRIVATE_ADMIN_ACCESS_KEY: SIGNING_KEY }, 'keys_distinct'],
    [{ PRIVATE_ADMIN_EXPIRES_AT: '2000-01-01T00:00:00Z' }, 'expiry_future'],
    [{ PRIVATE_ADMIN_EXPIRES_AT: '2099-01-01T00:00:00Z' }, 'expiry_within_24h'],
  ];
  for (const [delta, failedCheck] of cases) {
    let pageCalls = 0;
    const f = fixture(environment(delta), { createPage(options) { pageCalls++; return realCreatePage(options); } });
    const res = response();
    await f.handler(request(f.env), res);
    assertDisabled(res);
    assert.equal(pageCalls, 1, 'invalid configuration must still fail in the existing page constructor');
    assert.equal(f.calls.storage, 0);
    const event = inspectEvent(f.events, { phase: 'page_factory', outcome: 'error' });
    assert.equal(event.checks[failedCheck], false, failedCheck);
    assert.equal(event.checks.adapter_created, true);
    assert.notEqual(event.checks.page_created, true);
  }
});
