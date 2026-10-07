'use strict';
// Actual pinned Think model/query builder over a synthetic driver only.
// No database connection, durable SQL acceptance or deployed flow is tested.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const pg = require('pg');
const RealClient = pg.Client;
const originalThink = global.think;
const environment = Object.freeze({
  POSTGRES_HOST: 'ep-synthetic-private-pooler.ap-southeast-1.aws.neon.tech',
  PGHOST_UNPOOLED: 'ep-synthetic-private.ap-southeast-1.aws.neon.tech',
  POSTGRES_USER: 'neondb_owner', POSTGRES_PASSWORD: 'SYNTHETIC_SECRET', POSTGRES_DATABASE: 'neondb',
});
const PATH = '/p/synthetic/';
const fields = ['id', 'comment', 'status', 'url', 'insertedat', 'createdat', 'updatedat'];
let state;
class FakeClient extends EventEmitter {
  constructor(config) {
    super(); this.config = config; this.sql = []; this.txStatus = 'I'; this.readyForQuery = true;
    this.ended = 0; this.destroyed = 0; this.didUpdate = false;
    this.connection = { stream: { encrypted: true, authorized: true, getProtocol: () => 'TLSv1.3', destroy: () => { this.destroyed++; } } };
    state.clients.push(this);
  }
  async connect() {}
  getTransactionStatus() { return this.txStatus; }
  async query(text) {
    this.sql.push(text);
    if (text.startsWith('BEGIN')) this.txStatus = 'T';
    if (text === 'COMMIT' || text === 'ROLLBACK') this.txStatus = 'I';
    if (text === 'COMMIT' && this.didUpdate && state.loseCommitReply) throw Error('SYNTHETIC_DRIVER_SECRET');
    if (text.includes('INFORMATION_SCHEMA.COLUMNS')) return { rows: fields.map(column_name => ({ column_name, data_type: column_name === 'id' ? 'integer' : 'text', is_nullable: 'YES' })) };
    if (text.includes('pg_indexes')) return { rows: [] };
    if (text.startsWith('SELECT')) return { rows: state.missing ? [] : [structuredClone(state.row)] };
    if (text.startsWith('UPDATE')) {
      this.didUpdate = true;
      if (state.beforeUpdate) await state.beforeUpdate();
      if (state.failUpdate) throw Error('SYNTHETIC_DRIVER_SECRET');
      const status = /SET status=E'([^']+)'/.exec(text)?.[1];
      const expected = /status = E'([^']+)'/.exec(text)?.[1];
      const url = /url = E'([^']+)'/.exec(text)?.[1];
      const matches = expected === state.row.status && url === state.row.url;
      if (matches) state.row.status = status;
      return { command: 'UPDATE', rowCount: state.affected ?? (matches ? 1 : 0), rows: [] };
    }
    return { rows: [] };
  }
  async end() { this.ended++; }
}
const networkRestores = [];
before(() => {
  pg.Client = FakeClient;
  for (const [object, key] of [[require('node:net').Socket.prototype, 'connect'], [require('node:tls'), 'connect'], [require('node:dns'), 'lookup']]) {
    const original = object[key]; networkRestores.push(() => { object[key] = original; });
    object[key] = () => { throw Error('SYNTHETIC_NETWORK_FORBIDDEN'); };
  }
});
after(() => { pg.Client = RealClient; for (const restore of networkRestores) restore(); assert.equal(global.think, originalThink); });
function fixture(options = {}) {
  state = { clients: [], row: { id: 7, comment: 'Synthetic', status: 'waiting', url: PATH, insertedat: new Date('2026-10-07T00:00:00Z') }, ...options };
  const adapter = require('../src/private-postgresql-adapter.cjs').createPrivatePostgresqlAdapter({ environment: () => environment });
  return { adapter, model: adapter.getModels().Comment };
}
const input = (from = 'waiting', to = 'spam') => ({ objectId: 7, from, to, url: PATH });
const updates = () => state.clients.flatMap(client => client.sql).filter(sql => sql.startsWith('UPDATE'));
const unavailable = error => error.message === 'Private PostgreSQL operation unavailable' && !('cause' in error);

test('private transition: exact three reversible moderation transitions use conditional builder UPDATE', async () => {
  for (const [from, to] of [['waiting', 'approved'], ['waiting', 'spam'], ['spam', 'waiting']]) {
    const { adapter, model } = fixture(); state.row.status = from;
    const args = input(from, to); const result = await model.transitionStatus(args);
    assert.equal(result.objectId, 7); assert.equal(result.status, to); assert.equal(result.url, PATH);
    assert.equal(result.insertedAt.toISOString(), '2026-10-07T00:00:00.000Z'); assert.equal('id' in result, false);
    assert.deepEqual(args, input(from, to)); assert.equal(updates().length, 1);
    assert.match(updates()[0], /UPDATE wl_comment SET status=/);
    assert.match(updates()[0], /id = 7/); assert.ok(updates()[0].includes(`status = E'${from}'`));
    assert.ok(updates()[0].includes(`url = E'${PATH}'`));
    assert.equal(state.row.status, to); assert.ok(state.clients.every(client => client.ended === 1 && client.destroyed === 1));
    await adapter.close();
  }
});

test('private transition: capability is Comment-only and validates before accessing storage', async () => {
  const { adapter, model } = fixture();
  assert.equal(adapter.getModels().Users.transitionStatus, undefined); assert.equal(adapter.getModels().Counter.transitionStatus, undefined);
  for (const args of [undefined, {}, { ...input(), from: 'approved' }, { ...input(), to: 'deleted' }, { ...input(), to: 'waiting' }, { ...input(), from: 'spam', to: 'approved' }, { ...input(), objectId: '<invalid>' }, { ...input(), objectId: 0 }, { ...input(), url: undefined }, { ...input(), url: '' }, { ...input(), status: 'approved' }]) {
    await assert.rejects(model.transitionStatus(args), unavailable);
  }
  assert.equal(state.clients.length, 0); await adapter.close();
});

test('private transition: canonical decimal form IDs work and extra row fields remain unchanged', async () => {
  const { adapter, model } = fixture(); const before = structuredClone(state.row);
  const result = await model.transitionStatus({ ...input(), objectId: '7' });
  assert.equal(result.objectId, 7); assert.equal(result.status, 'spam');
  assert.deepEqual(state.row, { ...before, status: 'spam' });
  assert.ok(state.clients.flatMap(client => client.sql).every(sql => !/^(DELETE|INSERT)\b/.test(sql)));
  await adapter.close();
});

test('private transition: queue tie-breaker uses supported normalized PostgreSQL order fields', async () => {
  const { adapter, model } = fixture();
  await model.select({ status: 'waiting' }, { offset: 20, limit: 20, order: [
    { field: 'insertedAt', direction: 'desc', nulls: 'last' },
    { field: 'objectId', direction: 'desc' },
  ] });
  const sql = state.clients.flatMap(client => client.sql).find(value => /^SELECT .*FROM wl_comment/.test(value));
  assert.match(sql, /ORDER BY insertedat DESC NULLS LAST,id DESC/);
  assert.match(sql, /LIMIT 20 OFFSET 20/); assert.equal(updates().length, 0);
  await adapter.close();
});

test('private transition: missing, changed status and changed path cannot be overwritten', async () => {
  const { adapter, model } = fixture({ missing: true });
  assert.equal(await model.transitionStatus(input()), null); assert.equal(updates().length, 0);
  state.missing = false;
  state.beforeUpdate = () => { state.row.status = 'spam'; };
  assert.equal(await model.transitionStatus(input('waiting', 'approved')), null); assert.equal(state.row.status, 'spam');
  state.row.status = 'waiting'; state.beforeUpdate = () => { state.row.url = '/p/changed/'; };
  assert.equal(await model.transitionStatus(input()), null); assert.equal(state.row.status, 'waiting');
  await adapter.close();
});

test('private transition: competing approve and reject have exactly one winner', async () => {
  const { adapter, model } = fixture();
  let arrived = 0, release; const barrier = new Promise(resolve => { release = resolve; });
  state.beforeUpdate = async () => { if (++arrived === 2) release(); await barrier; };
  const results = await Promise.all([model.transitionStatus(input('waiting', 'approved')), model.transitionStatus(input('waiting', 'spam'))]);
  assert.equal(results.filter(Boolean).length, 1); assert.equal(results.filter(result => result === null).length, 1);
  assert.equal(state.row.status, results.find(Boolean).status); assert.equal(updates().length, 2);
  await adapter.close();
});

test('private transition: unexpected affected count fails closed and an uncertain commit is never retried', async () => {
  for (const options of [{ affected: 2 }, { affected: '1' }, { loseCommitReply: true }, { failUpdate: true }]) {
    const { adapter, model } = fixture(options);
    await assert.rejects(model.transitionStatus(input()), unavailable); assert.equal(updates().length, 1);
    const writer = state.clients.find(client => client.didUpdate);
    if (options.loseCommitReply) { assert.equal(writer.sql.at(-1), 'COMMIT'); assert.equal(state.row.status, 'spam'); }
    if (options.failUpdate) assert.equal(writer.sql.at(-1), 'ROLLBACK');
    assert.equal(writer.ended, 1); assert.equal(writer.destroyed, 1); await adapter.close();
  }
});

test('private transition: closed adapter refuses capability without a connection', async () => {
  const { adapter, model } = fixture(); await adapter.close();
  await assert.rejects(model.transitionStatus(input()), unavailable); assert.equal(state.clients.length, 0);
});
