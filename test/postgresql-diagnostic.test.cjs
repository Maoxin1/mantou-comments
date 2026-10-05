'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const scenarios = ['success','missing','denied','connection-error','tls-error','readonly-error','query-error','rollback-error','release-error','close-error','idle-error','bad-catalog'];
function probe(scenario) {
  const child = spawnSync(process.execPath, [path.join(__dirname, 'probe-postgresql-diagnostic.cjs'), scenario], { encoding: 'utf8', timeout: 15000 });
  assert.equal(child.status, 0, child.stderr);
  const output = JSON.parse(child.stdout);
  assert.deepEqual(output.network, []);
  assert.deepEqual(output.logs, []);
  assert.equal(output.importedWaline, false);
  assert.doesNotMatch(child.stdout, /SYNTHETIC_SECRET|synthetic-private|postgres:\/\/|PRIVATE_SQL/);
  return output;
}
test('PG diagnostic: strict split configuration rejects omissions and targets; URL/PG flags cannot override TLS', () => {
  const { createPostgresqlOptions } = require('../src/postgresql-diagnostic.cjs');
  const env = { POSTGRES_HOST: 'ep-synthetic.ap-southeast-1.aws.neon.tech', POSTGRES_USER: 'fixture', POSTGRES_PASSWORD: 'SYNTHETIC_SECRET', POSTGRES_DATABASE: 'fixture' };
  for (const key of Object.keys(env)) { const value = { ...env }; delete value[key]; assert.throws(() => createPostgresqlOptions(value), /^Error: Diagnostic configuration is invalid$/); }
  for (const host of ['localhost','127.0.0.1','/tmp/socket','postgres://user@ep-test.neon.tech/db','ep-test.neon.tech.evil.example','evil.example','ep-test.neon.tech\n']) assert.throws(() => createPostgresqlOptions({ ...env, POSTGRES_HOST: host }));
  const config = createPostgresqlOptions({ ...env, DATABASE_URL: 'postgres://SYNTHETIC_SECRET@bad.invalid/db?sslmode=disable', PGHOST: 'bad.invalid', PG_SSL: 'false', PGSSLMODE: 'no-verify', POSTGRES_PORT: '1234', POSTGRES_PREFIX: 'bad_' });
  assert.equal(config.host, env.POSTGRES_HOST); assert.equal(config.port, 5432); assert.equal(config.max, 1);
  assert.deepEqual(config.ssl, { rejectUnauthorized: true, minVersion: 'TLSv1.2' });
  assert.equal(config.connectionString, undefined); assert.equal(config.logSql, false); assert.equal(config.logConnect, false);
  assert.match(config.options, /default_transaction_read_only=on/); assert.match(config.options, /search_path=pg_catalog/);
  assert.ok(config.connectionTimeoutMillis > 0 && config.connectionTimeoutMillis <= 5000);
  assert.ok(config.query_timeout > 0 && config.query_timeout <= 5000);
  assert.ok(config.statement_timeout > 0 && config.statement_timeout <= 5000);
});
test('PG diagnostic: genuine installed socket executes only fixed read-only SQL on one held connection', () => {
  const out = probe('success');
  assert.equal(out.result.status, 'ok'); assert.equal(out.result.transport, 'verified');
  assert.deepEqual(out.result.tables, { wl_comment: 'readable', wl_counter: 'readable', wl_users: 'readable' });
  assert.equal(out.connects, 1); assert.equal(out.releases, 1); assert.equal(out.destroyRelease, true); assert.equal(out.closes, 1);
  assert.equal(out.sql[0], 'BEGIN READ ONLY'); assert.equal(out.sql[1], 'SHOW transaction_read_only'); assert.equal(out.sql.at(-1), 'ROLLBACK');
  assert.equal(out.sql.length, 4); assert.match(out.sql[2], /pg_catalog\.pg_class/);
  assert.doesNotMatch(out.sql[2], /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|nextval|setval)\b/i);
  assert.equal(out.options.max, 1); assert.equal(out.options.logSql, false); assert.equal(out.options.logConnect, false);
  assert.deepEqual(out.options.ssl, { rejectUnauthorized: true, minVersion: 'TLSv1.2' });
});
test('PG diagnostic: absent or unreadable expected tables are separate from connectivity success', () => {
  assert.equal(probe('missing').result.tables.wl_users, 'absent');
  assert.equal(probe('denied').result.tables.wl_comment, 'not_readable');
  for (const scenario of ['missing','denied']) { const {result}=probe(scenario); assert.equal(result.status,'schema_incomplete'); assert.equal(result.transport,'verified'); }
});
test('PG diagnostic: connection, TLS, transaction, query, cleanup and idle errors are sanitized', () => {
  for (const scenario of scenarios.slice(3)) {
    const out = probe(scenario); assert.notEqual(out.result.status, 'ok', scenario);
    assert.equal(out.closes, 1, scenario);
    if (scenario !== 'connection-error') assert.equal(out.releases, 1, scenario);
    if (['connection-error','tls-error'].includes(scenario)) assert.equal(out.sql.length, 0, scenario);
    if (scenario === 'readonly-error') assert.equal(out.sql.some(sql => sql.includes('pg_catalog.pg_class')), false);
  }
});
test('PG diagnostic: imports and default entrypoint remain inert even with apparent runtime/request flags', () => {
  const out = probe('inert'); assert.equal(out.connects, 0); assert.equal(out.statusCode, 503); assert.equal(out.poolCreated, 0);
});
test('PG diagnostic: handler rejects all unauthenticated, malformed requests and declared body framing before environment access', () => {
  const out = probe('handler-denied'); assert.equal(out.connects, 0); assert.equal(out.environmentReads, 0); assert.equal(out.statusCodes.every(x => x === 503), true);
});
test('PG diagnostic: trusted authorization is explicit and concurrent allowed calls share one bounded diagnostic', () => {
  const out = probe('handler-success'); assert.equal(out.connects, 1); assert.equal(out.environmentReads, 1); assert.deepEqual(out.statusCodes, [200,200]); assert.equal(out.result.status,'ok');
});

test('PG diagnostic: actual pg.Client ignores hostile ambient connection/TLS/session overrides without connecting', () => {
  const { driver, connects, poolCreated } = probe('driver-options');
  assert.equal(connects, 0); assert.equal(poolCreated, 0);
  assert.deepEqual(driver.ssl, { rejectUnauthorized: true, minVersion: 'TLSv1.2' });
  assert.equal(driver.sslnegotiation, 'postgres'); assert.equal(driver.client_encoding, 'UTF8');
  assert.equal(driver.application_name, 'mantou-readonly-diagnostic'); assert.equal(driver.replication, 'false');
  assert.match(driver.options, /default_transaction_read_only=on/); assert.equal(driver.port, 5432);
});
test('PG diagnostic: stalled queries/connections are bounded and a late checkout is destroyed', () => {
  for (const scenario of ['connection-timeout','query-timeout','late-connection']) {
    const out=probe(scenario); assert.equal(out.result.status,'timeout',scenario);
    assert.equal(out.closes,1); assert.equal(out.connects,1);
    assert.equal(out.releases,scenario==='connection-timeout'?0:1);
    if (scenario!=='query-timeout') assert.equal(out.sql.length,0);
    else assert.equal(out.sql.some(sql=>sql==='ROLLBACK'),false);
  }
});

test('PG diagnostic: additional TLS, BEGIN, client-event and malformed-catalog failures stay closed', () => {
  for (const scenario of ['unencrypted','old-protocol','missing-protocol','begin-error','client-error','duplicate-catalog','contradictory-catalog']) {
    const out=probe(scenario); assert.notEqual(out.result.status,'ok',scenario);
    assert.equal(out.releases,1); assert.equal(out.closes,1); assert.equal(out.destroyRelease,true);
    if (['unencrypted','old-protocol','missing-protocol'].includes(scenario)) assert.equal(out.sql.length,0);
  }
});
