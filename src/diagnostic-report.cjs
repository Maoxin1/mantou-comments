'use strict';
// Protected diagnostic presentation only; never use as a public comment route.
// Every displayed string is fixed/allowlisted. HTTP 200 means the report rendered,
// not that a database check succeeded. The diagnostic outcome remains explicit.
const STATUS = new Set(['ok','schema_incomplete','configuration_invalid','connection_failed','tls_unverified','read_only_unconfirmed','query_failed','timeout','cleanup_or_transport_failed']);
const FAILURE = new Set(['none','configuration','connection','authentication','network','tls_verification','database_unavailable','read_only_check','query','timeout','cleanup','unknown','request']);
const PHASE = new Set(['configuration','driver_load','pool_creation','connect','tls_verification','read_only_check','catalog_query','cleanup','unknown']);
const REASON = new Set(['none','module_unavailable','driver_initialization','dns_lookup','tcp_transport','tls_certificate','authentication','database_unavailable','driver_timeout','deadline_timeout','protocol_rejected','startup_rejected','connection_limit','server_error','unknown']);
const SETTING = new Set(['replication','options','statement_timeout','lock_timeout','idle_in_transaction_session_timeout','search_path','default_transaction_read_only']);
const TABLES = ['wl_comment','wl_counter','wl_users'];
const STATES = new Set(['readable','not_readable','absent']);
function projectDiagnosticReport(body, httpStatus) {
  const unavailable = () => ({ status: 'unavailable', transport: 'unconfirmed', failureClass: 'unknown', failurePhase: 'unknown', failureReason: 'unknown', diagnosticHttpStatus: 503 });
  let value;
  try { value = JSON.parse(body); } catch { return unavailable(); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return unavailable();
  if (value.errno === 503 && value.errmsg === 'Comments are not enabled') return { status: 'request_rejected', transport: 'unconfirmed', failureClass: 'request', failurePhase: 'unknown', failureReason: 'unknown', diagnosticHttpStatus: 503 };
  if (!STATUS.has(value.status) || !['verified','unconfirmed'].includes(value.transport) || ![200,503].includes(httpStatus)) return unavailable();
  const report = { status: value.status, transport: value.transport, failureClass: FAILURE.has(value.failureClass) ? value.failureClass : 'unknown', diagnosticHttpStatus: httpStatus };
  if (['ok','schema_incomplete'].includes(value.status)) {
    if (httpStatus !== 200 || value.transport !== 'verified' || !value.tables || !TABLES.every(name => STATES.has(value.tables[name]))) return unavailable();
    if ((value.status === 'ok') !== TABLES.every(name => value.tables[name] === 'readable')) return unavailable();
    report.tables = Object.fromEntries(TABLES.map(name => [name,value.tables[name]]));
    report.failureClass = 'none';
  } else {
    report.failurePhase = PHASE.has(value.failurePhase) ? value.failurePhase : 'unknown';
    report.failureReason = REASON.has(value.failureReason) ? value.failureReason : 'unknown';
    if (report.failurePhase === 'connect' && report.failureReason === 'startup_rejected' && SETTING.has(value.failureSetting)) report.failureSetting = value.failureSetting;
  }
  return report;
}
function headers(res) {
  res.statusCode = 200;
  res.setHeader('content-type','text/html; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('referrer-policy','same-origin');
  res.setHeader('content-security-policy',"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
}
function renderDiagnosticReport(res, report) {
  headers(res);
  const text = JSON.stringify(report,null,2).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  res.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Read-only diagnostic result</title><h1>Read-only diagnostic result</h1><p>HTTP 200 means this report was displayed. This is not a database acceptance pass.</p><pre>'+text+'</pre><p>No automatic retry was performed. Keep this result for review.</p><p><a href="https://github.com/Maoxin1/mantou-comments">Source and licenses</a></p></html>');
}
function renderDiagnosticReportForm(res) {
  headers(res);
  res.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Protected database diagnostic report</title><h1>Protected database diagnostic report</h1><p>One read-only connection and expected-table permission check. No row reads, schema changes, data writes or administrator setup.</p><form method="post" action="/__diagnostics/report"><button type="submit">Run read-only check and show report</button></form><p><a href="https://github.com/Maoxin1/mantou-comments">Source and licenses</a></p></html>');
}
module.exports = { projectDiagnosticReport, renderDiagnosticReport, renderDiagnosticReportForm };
