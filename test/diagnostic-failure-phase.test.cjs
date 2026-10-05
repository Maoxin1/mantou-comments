'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PHASES = ['configuration', 'driver_load', 'pool_creation', 'connect', 'tls_verification', 'read_only_check', 'catalog_query', 'cleanup', 'unknown'];
const REASONS = ['none', 'module_unavailable', 'driver_initialization', 'dns_lookup', 'tcp_transport', 'tls_certificate', 'authentication', 'database_unavailable', 'driver_timeout', 'deadline_timeout', 'protocol_rejected', 'startup_rejected', 'connection_limit', 'server_error', 'unknown'];
const SETTINGS = ['replication', 'options', 'statement_timeout', 'lock_timeout', 'idle_in_transaction_session_timeout', 'search_path', 'default_transaction_read_only'];
function probe(scenario) {
  const child = spawnSync(process.execPath, [path.join(__dirname, 'probe-diagnostic-failure-phase.cjs'), scenario], { encoding: 'utf8', timeout: 10000 });
  assert.equal(child.status, 0, child.stderr);
  assert.doesNotMatch(child.stdout, /SYNTHETIC_SECRET|synthetic-private|PRIVATE_SQL|MODULE_NOT_FOUND|ENOTFOUND|08P01|0A000|53300|XX000/);
  const out = JSON.parse(child.stdout);
  assert.deepEqual(out.network, []);
  assert.deepEqual(out.logs, []);
  assert.equal(out.importedWaline, false);
  return out;
}
function response() { return { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(body) { this.body = body; } }; }

test('diagnostic phase: configuration, driver loading and pool creation are separate before any connection', () => {
  for (const [scenario, status, failureClass, failureReason] of [
    ['configuration', 'configuration_invalid', 'configuration', 'unknown'],
    ['driver_load', 'connection_failed', 'connection', 'module_unavailable'],
    ['pool_creation', 'connection_failed', 'connection', 'driver_initialization'],
  ]) {
    const out = probe(scenario);
    assert.equal(out.result.status, status, scenario);
    assert.equal(out.result.failureClass, failureClass, scenario);
    assert.equal(out.result.failurePhase, scenario, scenario);
    assert.equal(out.result.failureReason, failureReason, scenario);
    assert.equal(out.connects, 0, scenario);
  }
});

test('diagnostic phase: code reasons stay allowlisted without overclaiming unknown startup failures', () => {
  for (const [scenario, failureClass, failureReason] of [
    ['dns', 'network', 'dns_lookup'], ['dns_again', 'network', 'dns_lookup'],
    ['tcp', 'network', 'tcp_transport'], ['tcp_reset', 'network', 'tcp_transport'],
    ['certificate', 'tls_verification', 'tls_certificate'], ['authentication', 'authentication', 'authentication'],
    ['database', 'database_unavailable', 'database_unavailable'], ['protocol', 'connection', 'protocol_rejected'],
    ['protocol_transport', 'connection', 'protocol_rejected'], ['startup', 'connection', 'startup_rejected'], ['limit', 'connection', 'connection_limit'],
    ['internal', 'connection', 'server_error'], ['unknown', 'connection', 'unknown'], ['hostile_error', 'connection', 'unknown'],
  ]) {
    const out = probe(scenario);
    assert.equal(out.result.status, 'connection_failed', scenario);
    assert.equal(out.result.transport, 'unconfirmed', scenario);
    assert.equal(out.result.failureClass, failureClass, scenario);
    assert.equal(out.result.failurePhase, 'connect', scenario);
    assert.equal(out.result.failureReason, failureReason, scenario);
    assert.equal(out.connects, 1, scenario);
    assert.equal(out.closes, 1, scenario);
  }
});

test('diagnostic phase: exact code-less driver timeout messages are timeout failures, never substring matches', () => {
  for (const scenario of ['client_timeout', 'pool_timeout', 'queue_timeout', 'coded_timeout']) {
    const { result, connects, closes } = probe(scenario);
    assert.equal(result.status, 'timeout', scenario);
    assert.equal(result.failureClass, 'timeout', scenario);
    assert.equal(result.failurePhase, 'connect', scenario);
    assert.equal(result.failureReason, 'driver_timeout', scenario);
    assert.equal(connects, 1); assert.equal(closes, 1);
  }
  for (const scenario of ['timeout_substring', 'query_timeout_wrong_phase', 'generic_connection_terminated']) {
    const { result } = probe(scenario);
    assert.equal(result.status, 'connection_failed', scenario);
    assert.equal(result.failureReason, 'unknown', scenario);
  }
  for (const [scenario, failurePhase] of [['read_only_driver_timeout', 'read_only_check'], ['catalog_driver_timeout', 'catalog_query']]) {
    const { result } = probe(scenario);
    assert.equal(result.status, 'timeout', scenario);
    assert.equal(result.failureClass, 'timeout', scenario);
    assert.equal(result.failurePhase, failurePhase, scenario);
    assert.equal(result.failureReason, 'driver_timeout', scenario);
  }
});

test('diagnostic phase: only exact connect-stage startup messages expose a fixed setting name', () => {
  for (const field of SETTINGS) {
    for (const prefix of ['startup_field', 'startup_option']) {
      const { result } = probe(`${prefix}:${field}`);
      assert.equal(result.status, 'connection_failed');
      assert.equal(result.failurePhase, 'connect');
      assert.equal(result.failureReason, 'startup_rejected');
      assert.equal(result.failureSetting, field);
    }
  }
  for (const scenario of ['startup_unknown_field', 'startup_value_suffix', 'startup_message_prefix', 'startup_trailing_newline', 'startup_trailing_line_separator', 'startup_wrong_phase']) {
    const { result } = probe(scenario);
    assert.equal(result.failureReason, 'server_error', scenario);
    assert.equal(Object.hasOwn(result, 'failureSetting'), false, scenario);
  }
});

test('diagnostic phase: actual installed pg-pool code-less timeout is reproduced with a fake client and accelerated timers', () => {
  const out = probe('actual_pool_timeout');
  assert.equal(out.result.status, 'timeout');
  assert.equal(out.result.failureClass, 'timeout');
  assert.equal(out.result.failurePhase, 'connect');
  assert.equal(out.result.failureReason, 'driver_timeout');
  assert.equal(out.connects, 1); assert.equal(out.closes, 1); assert.equal(out.releases, 0);
});

test('diagnostic phase: application deadline remains distinguishable from driver timeout', () => {
  const out = probe('deadline');
  assert.equal(out.result.status, 'timeout');
  assert.equal(out.result.failureClass, 'timeout');
  assert.equal(out.result.failurePhase, 'connect');
  assert.equal(out.result.failureReason, 'deadline_timeout');
  assert.equal(out.connects, 1); assert.equal(out.closes, 1);
});

test('diagnostic phase: post-checkout TLS, read-only, catalog and cleanup failures retain their stage', () => {
  for (const [scenario, status, failurePhase] of [
    ['tls_check', 'tls_unverified', 'tls_verification'],
    ['read_only_check', 'read_only_unconfirmed', 'read_only_check'],
    ['catalog_query', 'query_failed', 'catalog_query'],
    ['cleanup', 'cleanup_or_transport_failed', 'cleanup'],
  ]) {
    const out = probe(scenario);
    assert.equal(out.result.status, status, scenario);
    assert.equal(out.result.failurePhase, failurePhase, scenario);
    assert.ok(REASONS.includes(out.result.failureReason), scenario);
    assert.equal(out.connects, 1); assert.equal(out.closes, 1); assert.equal(out.releases, 1);
  }
});

test('diagnostic phase: report preserves only allowlisted phase/reason values and explicit failed diagnostic status', () => {
  const { projectDiagnosticReport, renderDiagnosticReport } = require('../src/diagnostic-report.cjs');
  const value = { status: 'connection_failed', transport: 'unconfirmed', failureClass: 'network', failurePhase: 'connect', failureReason: 'dns_lookup' };
  for (const failurePhase of PHASES) assert.equal(projectDiagnosticReport(JSON.stringify({ ...value, failurePhase }), 503).failurePhase, failurePhase);
  for (const failureReason of REASONS) assert.equal(projectDiagnosticReport(JSON.stringify({ ...value, failureReason }), 503).failureReason, failureReason);
  for (const failureSetting of SETTINGS) assert.equal(projectDiagnosticReport(JSON.stringify({ ...value, failureReason: 'startup_rejected', failureSetting }), 503).failureSetting, failureSetting);
  for (const change of [{ failurePhase: 'catalog_query', failureReason: 'startup_rejected' }, { failurePhase: 'connect', failureReason: 'server_error' }]) {
    const contextMismatch = projectDiagnosticReport(JSON.stringify({ ...value, ...change, failureSetting: 'options' }), 503);
    assert.equal(Object.hasOwn(contextMismatch, 'failureSetting'), false);
  }
  const report = projectDiagnosticReport(JSON.stringify(value), 503), res = response();
  renderDiagnosticReport(res, report);
  assert.equal(report.failureClass, 'network');
  assert.equal(report.failurePhase, 'connect');
  assert.equal(report.failureReason, 'dns_lookup');
  assert.equal(report.diagnosticHttpStatus, 503);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /not a database acceptance pass/);
  assert.doesNotMatch(res.body, /"status": "ok"/);
});

test('diagnostic phase: hostile or absent metadata projects to unknown and rendered text remains escaped', () => {
  const { projectDiagnosticReport, renderDiagnosticReport } = require('../src/diagnostic-report.cjs');
  for (const hostile of [undefined, null, {}, [], '<script>SYNTHETIC_SECRET</script>', 'synthetic-private']) {
    const value = { status: 'connection_failed', transport: 'unconfirmed', failureClass: 'SYNTHETIC_SECRET', failurePhase: hostile, failureReason: hostile, failureSetting: hostile, error: 'SYNTHETIC_SECRET', code: 'XX000' };
    const report = projectDiagnosticReport(JSON.stringify(value), 503), res = response();
    assert.equal(report.failureClass, 'unknown');
    assert.equal(report.failurePhase, 'unknown');
    assert.equal(report.failureReason, 'unknown');
    assert.equal(Object.hasOwn(report, 'failureSetting'), false);
    renderDiagnosticReport(res, report);
    assert.doesNotMatch(res.body, /SYNTHETIC_SECRET|synthetic-private|<script>|XX000/);
  }
  const escaped = response();
  renderDiagnosticReport(escaped, { status: '<script>&</script>' });
  assert.doesNotMatch(escaped.body, /<script>/);
  assert.match(escaped.body, /&lt;script&gt;&amp;&lt;\/script&gt;/);
});
