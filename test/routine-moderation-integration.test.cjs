'use strict';
// Joined release runtime -> page -> pinned core -> installed PostgreSQL adapter
// and Think query builder. Only pg transport and the publication registry are
// synthetic; this is not browser, PostgreSQL durability or deployment evidence.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { EventEmitter } = require('node:events');
const { PasswordHash } = require('phpass');
const pg = require('pg');

test('routine moderation integration: real runtime, login and builder compose for page-two reject, restore and stale conflicts', async t => {
  const host = 'mantou-comments-synthetic-mantous-projects-af7e7067.vercel.app';
  const origin = 'https://' + host, path = '/p/synthetic/';
  const password = 'Synthetic-only-password-123';
  const account = { id: 1, email: 'synthetic-owner@example.invalid', display_name: 'Synthetic Owner', type: 'administrator', password: await new PasswordHash().hashPasswordAsync(password) };
  const comments = Array.from({ length: 25 }, (_, index) => ({
    id: index + 101, status: 'waiting', url: path, nick: 'Synthetic reader', comment: 'Synthetic item ' + (index + 101),
    insertedat: new Date('2026-10-07T00:00:00Z'), createdat: new Date('2026-10-07T00:00:00Z'), updatedat: new Date('2026-10-07T00:00:00Z'),
  }));
  const statements = [], clients = [];
  let staleId;
  const schemas = {
    users: ['id', 'email', 'display_name', 'password', 'type', 'avatar', 'url', 'label', '2fa'],
    comment: ['id', 'status', 'url', 'nick', 'comment', 'insertedat', 'createdat', 'updatedat', 'pid', 'rid', 'user_id', 'mail'],
    counter: ['id', 'url', 'time'],
  };
  const equality = (sql, key) => new RegExp('\\b' + key + " = (?:E'([^']*)'|(\\d+))").exec(sql)?.slice(1).find(value => value !== undefined);
  const matching = (rows, sql) => rows.filter(row => {
    for (const key of ['id', 'status', 'url', 'email']) {
      const value = equality(sql, key);
      if (value !== undefined && String(row[key]) !== value) return false;
    }
    if (/status NOT IN \(/.test(sql) && ['waiting', 'spam'].includes(row.status)) return false;
    return true;
  });
  class FakeClient extends EventEmitter {
    constructor(config) {
      super(); this.config = config; this.readyForQuery = true; this.tx = 'I'; this.ended = 0; this.destroyed = 0;
      this.connection = { stream: { encrypted: true, authorized: true, getProtocol: () => 'TLSv1.3', destroy: () => { this.destroyed++; } } };
      clients.push(this);
    }
    async connect() {}
    getTransactionStatus() { return this.tx; }
    async end() { this.ended++; }
    async query(sql) {
      statements.push(sql);
      if (sql.startsWith('BEGIN')) this.tx = 'T';
      if (sql === 'COMMIT' || sql === 'ROLLBACK') this.tx = 'I';
      if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
        const table = /table_name='wl_(\w+)'/.exec(sql)?.[1];
        assert.ok(schemas[table], 'Unexpected metadata table: ' + sql);
        return { rows: schemas[table].map(column_name => ({ column_name, data_type: column_name === 'id' ? 'integer' : 'text', is_nullable: 'YES' })) };
      }
      if (sql.includes('pg_indexes')) return { rows: [] };
      if (sql.startsWith('UPDATE')) {
        assert.match(sql, /^UPDATE wl_comment SET status=E'(?:spam|waiting|approved)' WHERE /);
        assert.notEqual(equality(sql, 'id'), undefined); assert.notEqual(equality(sql, 'status'), undefined); assert.equal(equality(sql, 'url'), path);
        if (staleId !== undefined) { comments.find(row => row.id === staleId).status = 'spam'; staleId = undefined; }
        const changed = matching(comments, sql);
        const status = /SET status=E'([^']+)'/.exec(sql)[1];
        for (const row of changed) row.status = status;
        return { command: 'UPDATE', rowCount: changed.length, rows: [] };
      }
      if (/^SELECT .* FROM wl_(users|comment)/.test(sql)) {
        const table = / FROM wl_(users|comment)/.exec(sql)[1];
        let rows = matching(table === 'users' ? [account] : comments, sql);
        if (/COUNT\(/.test(sql)) return { rows: [{ think_count: String(rows.length) }] };
        if (table === 'comment' && sql.includes('ORDER BY')) {
          assert.match(sql, /ORDER BY insertedat DESC NULLS LAST,id DESC/);
          rows.sort((left, right) => right.insertedat - left.insertedat || right.id - left.id);
        }
        const limit = / LIMIT (\d+)/.exec(sql), offset = Number(/ OFFSET (\d+)/.exec(sql)?.[1] ?? 0);
        return { rows: structuredClone(rows.slice(offset, limit ? offset + Number(limit[1]) : undefined)) };
      }
      if (/^(SELECT|INSERT|DELETE|UPDATE)\b/.test(sql)) assert.fail('Unexpected SQL: ' + sql);
      return { rows: [] };
    }
  }
  const OriginalClient = pg.Client; pg.Client = FakeClient;
  t.after(() => { pg.Client = OriginalClient; });
  const restores = [];
  for (const [object, key] of [[require('node:net').Socket.prototype, 'connect'], [require('node:tls'), 'connect'], [require('node:dns'), 'lookup']]) {
    const original = object[key]; object[key] = () => { throw Error('SYNTHETIC_NETWORK_FORBIDDEN'); }; restores.push(() => { object[key] = original; });
  }
  t.after(() => restores.forEach(restore => restore()));
  const environment = {
    VERCEL_ENV: 'production', VERCEL_PROJECT_ID: 'prj_NtBPfOSSwqaOLH0tejtx7Da5eE9Q', VERCEL_URL: host,
    NODEJS_HELPERS: '0', PUBLIC_COMMENTS_ENABLED: 'true', PRIVATE_ADMIN_ENABLED: 'true',
    PRIVATE_ADMIN_ACCESS_KEY: 'A'.repeat(64), JWT_TOKEN: 'B'.repeat(64),
    PRIVATE_ADMIN_EMAIL: account.email, PRIVATE_ADMIN_DISPLAY_NAME: account.display_name,
    PRIVATE_ADMIN_EXPIRES_AT: new Date(Math.floor((Date.now() + 3600000) / 1000) * 1000).toISOString().replace('.000Z', 'Z'),
    POSTGRES_HOST: 'ep-synthetic-private-pooler.ap-southeast-1.aws.neon.tech', PGHOST_UNPOOLED: 'ep-synthetic-private.ap-southeast-1.aws.neon.tech',
    POSTGRES_USER: 'neondb_owner', POSTGRES_DATABASE: 'neondb', POSTGRES_PASSWORD: 'SYNTHETIC_ONLY',
  };
  const handler = require('../deployment/public-comments.cjs').createPublicComments(environment, {
    createThreadRegistry: () => ({ isAllowed: value => value === path, getVersion: () => null }),
  });
  async function request(url, session, body, requestHost = host) {
    const data = body === undefined ? null : new URLSearchParams(body).toString();
    const req = Readable.from(data === null ? [] : [Buffer.from(data)]);
    Object.assign(req, { url, method: data === null ? 'GET' : 'POST', headers: { host: requestHost,
      ...(session ? { cookie: session } : {}), ...(data === null ? {} : { origin, 'content-type': 'application/x-www-form-urlencoded', 'content-length': String(Buffer.byteLength(data)) }),
    } });
    const res = { headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(text) { this.text = text; this.writableEnded = true; } };
    await handler(req, res); return res;
  }
  const csrf = response => response.text.match(/name="csrf" value="([^"]+)"/)?.[1];
  const cookie = (response, name) => response.headers['set-cookie'].find(value => value.startsWith(name + '=')).split(';')[0];
  const ids = response => [...response.text.matchAll(/<h3>Comment (\d+)<\/h3>/g)].map(match => Number(match[1]));
  const readerCount = async () => {
    const response = await request('/api/comment?type=count&url=' + encodeURIComponent(path), undefined, undefined, 'mantou-comments.vercel.app');
    assert.equal(response.statusCode, 200); assert.deepEqual(JSON.parse(response.text), { errno: 0, data: [0] });
  };

  const access = await request('/__private/access', undefined, { ownerAccessKey: environment.PRIVATE_ADMIN_ACCESS_KEY });
  assert.equal(access.statusCode, 303); assert.equal(clients.length, 0);
  const owner = cookie(access, '__Host-mantou-owner');
  const loginForm = await request('/__private/login', owner);
  const login = await request('/__private/login', owner, { csrf: csrf(loginForm), password });
  assert.equal(login.statusCode, 303); const session = owner + '; ' + cookie(login, '__Host-mantou-admin');
  const first = await request('/__private', session), second = await request('/__private?view=waiting&page=2', session);
  assert.equal(first.statusCode, 200); assert.equal(second.statusCode, 200);
  assert.deepEqual(ids(first), Array.from({ length: 20 }, (_, i) => 125 - i)); assert.deepEqual(ids(second), [105, 104, 103, 102, 101]);
  await readerCount();

  const reject = await request('/__private', session, { csrf: csrf(second), objectId: '105', action: 'spam', view: 'waiting', page: '2' });
  assert.equal(reject.statusCode, 303); assert.equal(reject.headers.location, '/__private?view=waiting&page=2');
  assert.equal(comments.find(row => row.id === 105).status, 'spam');
  assert.deepEqual(ids(await request(reject.headers.location, session)), [104, 103, 102, 101]);
  const spam = await request('/__private?view=spam&page=1', session);
  assert.equal(spam.statusCode, 200); assert.deepEqual(ids(spam), [105]); assert.doesNotMatch(spam.text, /Approve comment/);
  await readerCount();

  const restore = await request('/__private', session, { csrf: csrf(spam), objectId: '105', action: 'restore', view: 'spam', page: '1' });
  assert.equal(restore.statusCode, 303); assert.equal(restore.headers.location, '/__private?view=spam&page=1');
  assert.equal(comments.find(row => row.id === 105).status, 'waiting'); assert.deepEqual(ids(await request(restore.headers.location, session)), []);
  await readerCount();

  staleId = 104;
  const stale = await request('/__private', session, { csrf: csrf(second), objectId: '104', action: 'approve' });
  assert.equal(stale.statusCode, 409); assert.equal(comments.find(row => row.id === 104).status, 'spam');
  assert.equal(comments.length, 25); assert.equal(comments.filter(row => row.status === 'approved').length, 0);
  await readerCount();
  assert.equal(statements.filter(sql => sql.startsWith('UPDATE')).length, 3);
  assert.ok(statements.every(sql => !/^(INSERT|DELETE)\b/.test(sql)));
  assert.ok(clients.length > 1); assert.ok(clients.every(client => client.ended === 1 && client.destroyed === 1 && client.config.ssl.rejectUnauthorized === true && client.config.host === environment.PGHOST_UNPOOLED));
});
