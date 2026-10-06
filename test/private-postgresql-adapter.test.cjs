'use strict';
// Synthetic driver-boundary tests. No actual connection or credential access.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const pg = require('pg');
const RealClient = pg.Client;
const originalThink = global.think;
const originalConsole = {};
const networkRestores = [];
const logs = [];
let scenario, clients, environmentReads;
const environment = Object.freeze({
  POSTGRES_HOST: 'ep-synthetic-private-pooler.ap-southeast-1.aws.neon.tech',
  PGHOST_UNPOOLED: 'ep-synthetic-private.ap-southeast-1.aws.neon.tech',
  POSTGRES_USER: 'neondb_owner', POSTGRES_PASSWORD: 'SYNTHETIC_SECRET',
  POSTGRES_DATABASE: 'neondb',
});
const preflightRow = () => Object.fromEntries(['database_ok', 'role_ok', 'read_only_ok', 'table_ok', 'columns_ok', 'primary_key_ok', 'sequence_ok', 'privileges_ok'].map(key => [key, true]));
const preflight = text => text.startsWith('WITH bootstrap_target AS');
const rawRow = () => ({ id: 7, comment: 'Synthetic comment', status: 'waiting', insertedat: new Date('2026-10-06T00:00:00Z'), createdat: '2026-10-06 00:00:00', updatedat: '2026-10-06 00:00:00' });
const schema = ['id', 'comment', 'status', 'insertedat', 'createdat', 'updatedat', 'email', 'password', 'display_name', 'type', 'url', 'time'];
class FakeClient extends EventEmitter {
  constructor(config) {
    super(); this.config = config; this.sql = []; this.ended = 0; this.destroyed = 0;
    this.txStatus = 'I'; this.readyForQuery = true;
    this.connection = { stream: { encrypted: true, authorized: true, getProtocol: () => 'TLSv1.3', destroy: () => { this.destroyed++; } } };
    clients.push(this);
  }
  async connect() {
    if (scenario.connect) return scenario.connect(this);
    if (scenario.unverified) this.connection.stream.authorized = false;
    if (scenario.oldProtocol) this.connection.stream.getProtocol = () => 'TLSv1.1';
    if (scenario.nonidle) this.txStatus = 'T';
  }
  getTransactionStatus() { return this.txStatus; }
  async query(text, values) {
    this.sql.push({ text, values });
    if (scenario.query) return scenario.query(text, values, this);
    if (preflight(text)) return { rows: [preflightRow()] };
    if (text.startsWith('BEGIN')) this.txStatus = 'T';
    if (['COMMIT', 'ROLLBACK'].includes(text)) this.txStatus = 'I';
    if (text === 'SHOW transaction_read_only') return { rows: [{ transaction_read_only: 'off' }] };
    if (text === 'SELECT id FROM public.wl_users LIMIT 1') return { rows: [] };
    if (text.includes('INFORMATION_SCHEMA.COLUMNS')) return { rows: schema.map(column_name => ({ column_name, data_type: column_name === 'id' ? 'integer' : 'text', is_nullable: 'YES' })) };
    if (text.includes('pg_indexes')) return { rows: [] };
    if (/^INSERT /i.test(text)) return { command: 'INSERT', rowCount: 1, rows: [{ id: 7 }] };
    if (/^UPDATE /i.test(text)) return { command: 'UPDATE', rowCount: 1, rows: [] };
    if (/^DELETE /i.test(text)) return { command: 'DELETE', rowCount: 1, rows: [] };
    if (/COUNT\(/i.test(text)) return { rows: [{ think_count: '2' }] };
    if (/^SELECT /i.test(text)) return { rows: [rawRow()] };
    return { rows: [] };
  }
  async end() { this.ended++; if (scenario.end) return scenario.end(this); }
}
before(() => {
  pg.Client = FakeClient;
  for (const name of ['log', 'error', 'warn', 'info', 'debug', 'trace']) {
    originalConsole[name] = console[name]; console[name] = (...items) => logs.push(items.map(String).join(' '));
  }
  for (const [object, key] of [[require('node:net').Socket.prototype, 'connect'], [require('node:tls'), 'connect'], [require('node:dns'), 'lookup']]) {
    const original = object[key]; networkRestores.push(() => { object[key] = original; });
    object[key] = () => { throw new Error('SYNTHETIC_NETWORK_FORBIDDEN'); };
  }
});
after(() => {
  pg.Client = RealClient;
  for (const restore of networkRestores) restore();
  Object.assign(console, originalConsole);
  assert.deepEqual(logs, []);
  assert.equal(global.think, originalThink);
});
function fixture(overrides = {}) {
  scenario = overrides; clients = []; environmentReads = 0;
  const { createPrivatePostgresqlAdapter } = require('../src/private-postgresql-adapter.cjs');
  return createPrivatePostgresqlAdapter({ environment: () => { environmentReads++; return environment; } });
}
const unavailable = error => error.message === 'Private PostgreSQL operation unavailable' && !('cause' in error);
async function flush() { for (let i = 0; i < 40; i++) await Promise.resolve(); }
test('private adapter: importing and obtaining real model facades is inert and does not install global think', async () => {
  const adapter = fixture();
  assert.deepEqual(Object.keys(adapter.getModels()), ['Comment', 'Users', 'Counter']);
  assert.equal(environmentReads, 0); assert.equal(clients.length, 0);
  assert.equal(global.think, originalThink); await adapter.close();
});
test('private adapter: same-endpoint direct route and strict TLS override ambient driver defaults', async () => {
  const adapter = fixture(); const lease = await adapter.acquireBootstrap();
  const options = clients[0].config;
  assert.equal(options.host, environment.PGHOST_UNPOOLED);
  assert.equal(options.port, 5432); assert.equal(options.connectionTimeoutMillis, 5000);
  assert.equal(options.query_timeout, 3000); assert.equal(options.statement_timeout, 2000);
  assert.equal(options.lock_timeout, 1000); assert.equal(options.idle_in_transaction_session_timeout, 3000);
  assert.equal(options.ssl.rejectUnauthorized, true); assert.equal(options.ssl.minVersion, 'TLSv1.2');
  assert.equal(options.ssl.servername, environment.PGHOST_UNPOOLED);
  assert.equal(typeof options.ssl.checkServerIdentity, 'function');
  assert.equal(options.sslnegotiation, 'postgres'); assert.equal(options.replication, 'false');
  assert.equal(options.client_encoding, 'UTF8');
  assert.equal(options.options, '-c default_transaction_read_only=on -c search_path=pg_catalog,public -c timezone=UTC');
  assert.equal(options.logSql, false); assert.equal(options.logConnect, false);
  const parameters = new RealClient(options).connectionParameters;
  assert.equal(parameters.ssl, options.ssl); assert.equal(parameters.host, environment.PGHOST_UNPOOLED);
  assert.equal(parameters.options, options.options); assert.equal(clients[0].sql.length, 1); assert.ok(preflight(clients[0].sql[0].text));
  await lease.dispose(); await adapter.close();
});
test('private adapter: rejects mismatched direct host before constructing a client', async () => {
  fixture();
  const adapter = require('../src/private-postgresql-adapter.cjs').createPrivatePostgresqlAdapter({ environment: () => ({ ...environment, PGHOST_UNPOOLED: 'ep-other.ap-southeast-1.aws.neon.tech' }) });
  await assert.rejects(adapter.acquireBootstrap(), unavailable); assert.equal(clients.length, 0);
});
test('private adapter: bootstrap leases are fresh, idle, exclusive, bounded and destroyed once', async () => {
  const adapter = fixture(); const first = await adapter.acquireBootstrap(); const second = await adapter.acquireBootstrap();
  assert.equal(clients.length, 2); assert.notEqual(first.client, second.client);
  assert.ok(clients.every(client => client.sql.length === 1 && preflight(client.sql[0].text)));
  await first.client.query('SELECT $1', ['SYNTHETIC_VALUE']);
  assert.deepEqual(clients[0].sql.at(-1), { text: 'SELECT $1', values: ['SYNTHETIC_VALUE'] });
  await first.dispose(); await first.dispose();
  assert.equal(clients[0].ended, 1); assert.equal(clients[0].destroyed, 1);
  await assert.rejects(first.client.query('SELECT 1'), unavailable);
  await adapter.close(); assert.equal(clients[1].ended, 1);
  await assert.rejects(adapter.acquireBootstrap(), unavailable);
});
test('private adapter: refuses unverifiable TLS and nonidle sessions without running SQL', async () => {
  for (const overrides of [{ unverified: true }, { oldProtocol: true }, { nonidle: true }]) {
    const adapter = fixture(overrides);
    await assert.rejects(adapter.acquireBootstrap(), unavailable);
    assert.deepEqual(clients[0].sql, []); assert.equal(clients[0].ended, 1); assert.equal(clients[0].destroyed, 1);
    await adapter.close();
  }
});
test('private adapter: real Waline SELECT maps table, objectId, date fields and descending null order', async () => {
  const adapter = fixture(); const fields = ['objectId', 'insertedAt', 'comment'];
  const result = await adapter.getModels().Comment.select({ objectId: 7 }, { field: fields, order: [{ field: 'insertedAt', direction: 'desc', nulls: 'last' }] });
  assert.equal(result[0].objectId, 7); assert.equal(result[0].insertedAt.toISOString(), '2026-10-06T00:00:00.000Z');
  assert.equal(result[0].createdAt, '2026-10-06 00:00:00'); assert.equal('id' in result[0], false); assert.equal('insertedat' in result[0], false);
  assert.deepEqual(fields, ['objectId', 'insertedAt', 'comment']);
  const sql = clients.flatMap(client => client.sql.map(item => item.text));
  assert.ok(sql.some(text => /SELECT .*id.*insertedat.*comment.*FROM wl_comment.*id = 7.*ORDER BY.*insertedat.*DESC NULLS LAST/.test(text)), sql.join('\n'));
  assert.ok(sql.every(text => !text.includes('objectid'))); assert.equal(sql[0], 'BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE');
  assert.equal(sql.at(-1), 'COMMIT'); assert.ok(clients.every(client => client.ended === 1 && client.destroyed === 1));
  await adapter.close();
});
test('private adapter: real Waline INSERT emits PostgreSQL ID and date columns without changing input', async () => {
  const adapter = fixture(); const date = new Date('2026-10-06T00:00:00Z');
  const input = { comment: "Synthetic ' quoted", insertedAt: date, status: 'waiting' };
  const result = await adapter.getModels().Comment.add(input);
  assert.equal(result.objectId, 7); assert.equal(input.insertedAt, date); assert.equal('createdAt' in input, false);
  const sql = clients.flatMap(client => client.sql.map(item => item.text)).find(text => text.startsWith('INSERT'));
  assert.match(sql, /INSERT INTO wl_comment/); assert.match(sql, /insertedat/); assert.match(sql, /createdat/); assert.match(sql, /updatedat/); assert.match(sql, /RETURNING id/); assert.match(sql, /2026-10-06 00:00:00/);
  await adapter.close();
});
test('private adapter: explicit creation/update dates survive upstream inherited add defaults', async () => {
  const adapter = fixture(); const date = new Date('2020-01-02T03:04:05Z');
  const result = await adapter.getModels().Comment.add({ comment: 'Synthetic historic fixture', createdAt: date, updatedAt: date });
  const sql = clients.flatMap(client => client.sql.map(item => item.text)).find(text => text.startsWith('INSERT'));
  assert.equal((sql.match(/2020-01-02 03:04:05/g) || []).length, 2);
  assert.equal(result.createdAt, '2020-01-02 03:04:05'); assert.equal(result.updatedAt, '2020-01-02 03:04:05');
  await adapter.close();
});
test('private adapter: real Waline UPDATE preserves normalized IDs and date mapping for core moderation', async () => {
  const adapter = fixture(); const [result] = await adapter.getModels().Comment.update({ status: 'approved' }, { objectId: 7 });
  assert.equal(result.objectId, 7); assert.equal(result.status, 'approved'); assert.equal('id' in result, false);
  assert.equal(result.insertedAt.toISOString(), '2026-10-06T00:00:00.000Z');
  assert.ok(clients.flatMap(client => client.sql).some(({ text }) => /UPDATE wl_comment SET status=E'approved'.*id = 7/.test(text)));
  await adapter.close();
});
test('private adapter: users and counters use the actual installed model tables and numeric count conversion', async () => {
  const adapter = fixture(); const models = adapter.getModels();
  await models.Users.select({ email: 'synthetic@example.invalid' });
  assert.equal(await models.Counter.count({ url: '/synthetic' }), 2);
  const sql = clients.flatMap(client => client.sql.map(item => item.text));
  assert.ok(sql.some(text => text.includes('FROM wl_users'))); assert.ok(sql.some(text => text.includes('FROM wl_counter')));
  await adapter.close();
});
test('private adapter: driver failures are redacted, rolled back before commit and destroyed without logging', async () => {
  const adapter = fixture({ query: async text => { if (text.startsWith('SELECT')) throw new Error('SYNTHETIC_SECRET SQL host'); return { rows: [] }; } });
  await assert.rejects(adapter.getModels().Users.select({}), unavailable);
  assert.equal(clients[0].sql.at(-1).text, 'ROLLBACK'); assert.equal(clients[0].ended, 1);
  assert.deepEqual(logs, []); await adapter.close();
});
test('private adapter: actual bootstrap preflights in read-only autocommit then explicitly starts its write transaction', async () => {
  const adapter = fixture(); const { createPrivateAdministratorBootstrap } = require('../src/private-admin-bootstrap.cjs');
  const bootstrap = createPrivateAdministratorBootstrap({ authorize: () => true, expectedEmail: 'owner@example.invalid', acquire: adapter.acquireBootstrap });
  const result = await bootstrap({ readInput: () => ({ email: 'owner@example.invalid', displayName: 'Synthetic Owner', password: 'synthetic-private-password', confirmPassword: 'synthetic-private-password' }) });
  assert.deepEqual(result, { status: 'created', administratorId: 7, cleanup: 'confirmed' });
  assert.equal(clients.length, 1); assert.ok(preflight(clients[0].sql[0].text)); assert.equal(clients[0].sql[1].text, 'BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE');
  assert.equal(clients[0].sql.at(-1).text, 'COMMIT'); assert.equal(clients[0].ended, 1); await adapter.close();
});

test('private adapter: bootstrap fails closed on every target/schema/visibility/privilege preflight gate', async () => {
  for (const key of Object.keys(preflightRow())) {
    const adapter = fixture({ query: async text => { assert.ok(preflight(text)); return { rows: [{ ...preflightRow(), [key]: false }] }; } });
    await assert.rejects(adapter.acquireBootstrap(), unavailable);
    assert.equal(clients[0].ended, 1); assert.equal(clients[0].sql.length, 1); await adapter.close();
  }
  const adapter = fixture({ query: async (_text, _values, client) => { client.txStatus = 'T'; return { rows: [preflightRow()] }; } });
  await assert.rejects(adapter.acquireBootstrap(), unavailable); await adapter.close();
});
test('private adapter: timestamp-without-timezone parser is per-client UTC, leaving installed parser unchanged', async () => {
  const originalParser = pg.types.getTypeParser(1114, 'text');
  const adapter = fixture(); const lease = await adapter.acquireBootstrap();
  const options = clients[0].config; const actual = new RealClient(options);
  assert.equal(actual.getTypeParser(1114, 'text')('2026-10-06 00:00:00').toISOString(), '2026-10-06T00:00:00.000Z');
  assert.equal(actual.getTypeParser(1114, 'text')('infinity'), Infinity);
  assert.equal(pg.types.getTypeParser(1114, 'text'), originalParser);
  assert.equal(actual.getTypeParser(23, 'text')('7'), 7);
  assert.equal(actual.getTypeParser(1184, 'text')('2026-10-06 00:00:00+00').toISOString(), '2026-10-06T00:00:00.000Z');
  await lease.dispose(); await adapter.close();
});
test('private adapter: certificate hostname validation is bound to the configured direct endpoint', async () => {
  const adapter = fixture(); const lease = await adapter.acquireBootstrap();
  const verify = clients[0].config.ssl.checkServerIdentity;
  const result = verify('ep-attacker.neon.tech', { subject: { CN: 'ep-attacker.neon.tech' }, subjectaltname: 'DNS:ep-attacker.neon.tech' });
  assert.equal(result.code, 'ERR_TLS_CERT_ALTNAME_INVALID');
  assert.equal(verify('ignored-request-host', { subjectaltname: `DNS:${environment.PGHOST_UNPOOLED}` }), undefined);
  await lease.dispose(); await adapter.close();
});
test('private adapter: connect deadline destroys a late client without returning a usable lease', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let finish;
  const adapter = fixture({ connect: () => new Promise(resolve => { finish = resolve; }) });
  const pending = assert.rejects(adapter.acquireBootstrap(), unavailable);
  await flush(); assert.equal(clients.length, 1); t.mock.timers.tick(5501); await flush();
  await pending; finish(); await flush();
  assert.equal(clients[0].ended, 1); assert.ok(clients[0].destroyed >= 1); assert.deepEqual(clients[0].sql, []);
  await adapter.close(); t.mock.timers.reset();
});
test('private adapter: query deadline makes the lease unusable and cleanup remains bounded', async t => {
  const adapter = fixture(); const lease = await adapter.acquireBootstrap();
  scenario.query = () => new Promise(() => {});
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = assert.rejects(lease.client.query('SELECT private_fixture'), unavailable);
  await flush(); t.mock.timers.tick(3501); await pending;
  await assert.rejects(lease.client.query('SELECT 1'), unavailable);
  await lease.dispose(); assert.equal(clients[0].ended, 1); assert.ok(clients[0].destroyed >= 1);
  await adapter.close(); t.mock.timers.reset();
});
test('private adapter: close deadline is sanitized after transport destruction', async t => {
  const adapter = fixture(); const lease = await adapter.acquireBootstrap(); scenario.end = () => new Promise(() => {});
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = assert.rejects(lease.dispose(), unavailable); await flush(); t.mock.timers.tick(2001); await pending;
  assert.equal(clients[0].ended, 1); assert.equal(clients[0].destroyed, 1);
  await adapter.close(); t.mock.timers.reset();
});
test('private adapter: a failed COMMIT is never retried or followed by misleading rollback', async () => {
  const adapter = fixture({ query: async text => { if (text === 'COMMIT') throw new Error('SYNTHETIC_SECRET lost acknowledgement'); return { rows: text.startsWith('SELECT') ? [rawRow()] : [] }; } });
  await assert.rejects(adapter.getModels().Comment.select({}), unavailable);
  assert.equal(clients[0].sql.filter(item => item.text === 'COMMIT').length, 1);
  assert.equal(clients[0].sql.some(item => item.text === 'ROLLBACK'), false); assert.equal(clients[0].ended, 1);
  await adapter.close();
});
test('private adapter: asynchronous driver errors terminate the exclusive lease without logging', async () => {
  const adapter = fixture(); const lease = await adapter.acquireBootstrap();
  clients[0].emit('error', new Error('SYNTHETIC_SECRET host and SQL'));
  await assert.rejects(lease.client.query('SELECT 1'), unavailable); await adapter.close();
  assert.equal(clients[0].ended, 1); assert.equal(clients[0].destroyed, 1); assert.deepEqual(logs, []);
});
test('private adapter: installed schema discovery qualifies public and never reuses another adapter cache', async () => {
  for (let i = 0; i < 2; i++) {
    const adapter = fixture(); const model = adapter.getModels().Comment;
    await model.add({ comment: 'Synthetic schema isolation fixture', status: 'waiting' });
    const metadata = () => clients.flatMap(client => client.sql.map(item => item.text)).filter(text => /INFORMATION_SCHEMA\.COLUMNS|FROM pg_indexes/.test(text));
    assert.equal(metadata().length, 2, 'Each adapter must discover its own schema');
    assert.ok(metadata().some(text => text.endsWith("AND table_schema='public'")));
    assert.ok(metadata().some(text => text.endsWith("AND schemaname='public'")));
    await model.add({ comment: 'Second fixture on the same adapter' });
    assert.equal(metadata().length, 2, 'The isolated cache can be reused only inside its owning adapter');
    await adapter.close();
  }
});
