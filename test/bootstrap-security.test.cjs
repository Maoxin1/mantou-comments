'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const child = spawnSync(process.execPath, [path.join(__dirname, 'probe-bootstrap.cjs')], { encoding: 'utf8', env: process.env });
assert.equal(child.status, 0, child.stderr);
const probe = JSON.parse(child.stdout);
test('security: isolated bootstrap never imports unused provider/Akismet vulnerability trees', () => {
  assert.deepEqual(probe.imported, []);
});
test('security: startup has zero instrumented HTTP/HTTPS/net/TLS attempts', () => { assert.deepEqual(probe.network, []); });
test('security: resolved configuration and synthetic JWT are never written to runtime snapshots', () => { assert.deepEqual(probe.snapshots, []); });
test('security: future PostgreSQL adapter config verifies certificates and suppresses SQL/credential logging', () => {
  assert.equal(probe.pg.ssl?.rejectUnauthorized, true);
  assert.equal(probe.pg.ssl?.minVersion, 'TLSv1.2');
  assert.equal(probe.pg.logSql, false); assert.equal(probe.pg.logConnect, false);
});

test('security: actual pg.Pool receives verified TLS options without opening a database connection', () => { assert.equal(probe.poolSSL.rejectUnauthorized, true); assert.equal(probe.poolSSL.minVersion, 'TLSv1.2'); });
test('security: real PostgreSQL socket class logs neither synthetic connection credentials nor fake query text', () => { assert.deepEqual(probe.pgLogs, []); });
