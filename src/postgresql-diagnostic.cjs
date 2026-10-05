'use strict';
// Local preparation, 2026-10-05. AGPL-3.0-or-later; see LICENSE-CHOICES.md.
// No import-time environment reads, connections, ThinkJS or Waline bootstrap.
// Invoke only from a separately authorized trusted server-side diagnostic caller.
const TABLES = Object.freeze(['wl_comment', 'wl_counter', 'wl_users']);
const CATALOG_SQL = `SELECT e.table_name,
  (c.oid IS NOT NULL) AS present,
  COALESCE(pg_catalog.has_schema_privilege(n.oid, 'USAGE') AND
    pg_catalog.has_table_privilege(c.oid, 'SELECT'), false) AS readable
FROM (VALUES ('wl_comment'), ('wl_counter'), ('wl_users')) AS e(table_name)
LEFT JOIN pg_catalog.pg_namespace AS n ON n.nspname = 'public'
LEFT JOIN pg_catalog.pg_class AS c ON c.relnamespace = n.oid
  AND c.relname = e.table_name AND c.relkind = 'r'
ORDER BY e.table_name`;
const noop = () => {};
function createPostgresqlOptions(environment) {
  const invalid = () => { throw new Error('Diagnostic configuration is invalid'); };
  if (!environment || typeof environment !== 'object') invalid();
  const values = {};
  for (const [key, target] of [['POSTGRES_HOST','host'], ['POSTGRES_USER','user'], ['POSTGRES_PASSWORD','password'], ['POSTGRES_DATABASE','database']]) {
    const value = environment[key];
    if (typeof value !== 'string' || value.trim().length === 0 || value.includes('\0')) invalid();
    values[target] = value;
  }
  // Only a configured Neon DNS name. Never accept a URL, IP, socket, query,
  // userinfo or request-supplied destination; no localhost or PG_* fallback.
  if (values.host.length > 253 || !/^ep-[a-z0-9-]+(?:\.[a-z0-9-]+)*\.neon\.tech$/.test(values.host)) invalid();
  return {
    ...values, port: 5432, max: 1, min: 0, maxUses: 1,
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 1000,
    query_timeout: 3000, statement_timeout: 2000, lock_timeout: 1000,
    idle_in_transaction_session_timeout: 3000,
    ssl: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    sslnegotiation: 'postgres',
    options: '-c default_transaction_read_only=on -c search_path=pg_catalog',
    application_name: 'mantou-readonly-diagnostic', client_encoding: 'UTF8',
    replication: 'false', // A boolean false would fall through to PGREPLICATION.
    logSql: false, logConnect: false, logger: noop, log: noop,
    debounce: false,
  };
}
function fixedResult(status, transport = 'unconfirmed', tables, failureClass, failurePhase, failureReason, failureSetting) {
  return Object.freeze({ status, transport, ...(tables ? { tables: Object.freeze(tables) } : {}), ...(failureClass ? { failureClass } : {}), ...(failurePhase ? { failurePhase, failureReason } : {}), ...(failureSetting ? { failureSetting } : {}) });
}
function classifyFailure(error, stage) {
  // Classify only explicit error codes. Never echo a driver message/code, SQL,
  // host, user, database, certificate or stack into the report or any log.
  const codes = { ENOTFOUND:'network', EAI_AGAIN:'network', ECONNREFUSED:'network', ECONNRESET:'network', EHOSTUNREACH:'network', ENETUNREACH:'network', ETIMEDOUT:'timeout',
    '28P01':'authentication', '28000':'authentication', '3D000':'database_unavailable',
    ERR_TLS_CERT_ALTNAME_INVALID:'tls_verification', CERT_HAS_EXPIRED:'tls_verification', DEPTH_ZERO_SELF_SIGNED_CERT:'tls_verification', SELF_SIGNED_CERT_IN_CHAIN:'tls_verification', UNABLE_TO_VERIFY_LEAF_SIGNATURE:'tls_verification', UNABLE_TO_GET_ISSUER_CERT_LOCALLY:'tls_verification' };
  try { if (error && typeof error.code === 'string' && Object.hasOwn(codes,error.code)) return codes[error.code]; } catch {}
  return {configuration_invalid:'configuration',connection_failed:'connection',tls_unverified:'tls_verification',read_only_unconfirmed:'read_only_check',query_failed:'query',timeout:'timeout',cleanup_or_transport_failed:'cleanup'}[stage] || 'unknown';
}
function failureDetail(error, phase, deadline) {
  if (deadline) return { timeout: true, reason: 'deadline_timeout' };
  let code, message;
  try { code = typeof error?.code === 'string' ? error.code : undefined; } catch {}
  try { message = typeof error?.message === 'string' ? error.message : undefined; } catch {}
  // Match only fixed driver timeout texts; never serialize a message or cause.
  // pg's own deadline occurs before our outer timer and carries no error code.
  if (code === 'ETIMEDOUT' ||
      (phase === 'connect' && ['Connection terminated due to connection timeout', 'timeout expired', 'timeout exceeded when trying to connect'].includes(message)) ||
      (['read_only_check','catalog_query'].includes(phase) && message === 'Query read timeout')) {
    return { timeout: true, reason: 'driver_timeout' };
  }
  const rejected = phase === 'connect' && typeof message === 'string' && /^unsupported startup parameter(?: in options)?: (replication|options|statement_timeout|lock_timeout|idle_in_transaction_session_timeout|search_path|default_transaction_read_only)$/.exec(message);
  if (rejected && rejected[0] === message) return { reason: 'startup_rejected', setting: rejected[1] };
  if (phase === 'driver_load') return { reason: ['MODULE_NOT_FOUND','ERR_MODULE_NOT_FOUND'].includes(code) ? 'module_unavailable' : 'driver_initialization' };
  if (phase === 'pool_creation') return { reason: 'driver_initialization' };
  const reasons = {
    ENOTFOUND:'dns_lookup', EAI_AGAIN:'dns_lookup',
    ECONNREFUSED:'tcp_transport', ECONNRESET:'tcp_transport', EPIPE:'tcp_transport', EHOSTUNREACH:'tcp_transport', ENETUNREACH:'tcp_transport',
    '28P01':'authentication', '28000':'authentication', '3D000':'database_unavailable',
    ERR_TLS_CERT_ALTNAME_INVALID:'tls_certificate', CERT_HAS_EXPIRED:'tls_certificate', DEPTH_ZERO_SELF_SIGNED_CERT:'tls_certificate', SELF_SIGNED_CERT_IN_CHAIN:'tls_certificate', UNABLE_TO_VERIFY_LEAF_SIGNATURE:'tls_certificate', UNABLE_TO_GET_ISSUER_CERT_LOCALLY:'tls_certificate',
    EPROTO:'protocol_rejected', '08P01':'protocol_rejected', '53300':'connection_limit', XX000:'server_error',
  };
  if (code && Object.hasOwn(reasons,code)) return { reason: reasons[code] };
  if (phase === 'connect' && code === '0A000') return { reason: 'startup_rejected' };
  return { reason: 'unknown' };
}
function classifyCatalog(rows) {
  if (!Array.isArray(rows) || rows.length !== TABLES.length) throw new Error('Invalid diagnostic result');
  const tables = {};
  for (const row of rows) {
    if (!row || !TABLES.includes(row.table_name) || Object.hasOwn(tables, row.table_name) ||
      typeof row.present !== 'boolean' || typeof row.readable !== 'boolean' || (!row.present && row.readable)) throw new Error('Invalid diagnostic result');
    tables[row.table_name] = !row.present ? 'absent' : row.readable ? 'readable' : 'not_readable';
  }
  return Object.fromEntries(TABLES.map(name => [name, tables[name]]));
}
async function runPostgresqlDiagnostic(environment) {
  let options;
  try { options = createPostgresqlOptions(environment); }
  catch { return fixedResult('configuration_invalid','unconfirmed',undefined,'configuration','configuration','unknown'); }
  let socket, pool, client, connection;
  let begun = false, aborted = false, asynchronousError = false;
  let stage = 'connection_failed', phase = 'driver_load', transport = 'unconfirmed';
  let result = fixedResult(stage);
  const markError = () => { asynchronousError = true; };
  async function bounded(promise, milliseconds) {
    let timer;
    try {
      return await Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => { aborted = true; reject(new Error('Diagnostic timeout')); }, milliseconds);
      })]);
    } finally { clearTimeout(timer); }
  }
  async function query(sql) {
    if (aborted || asynchronousError) throw new Error('Diagnostic unavailable');
    const data = await bounded(socket.query({ sql, debounce: false }, connection), 3500);
    if (asynchronousError) throw new Error('Diagnostic unavailable');
    return data;
  }
  try {
    const Socket = require('think-model-postgresql/lib/socket');
    phase = 'pool_creation';
    socket = new Socket(options); // Never share the upstream instance cache.
    pool = socket.pool;
    pool.on('error', markError);
    // If a driver resolves after our deadline, discard that late connection.
    phase = 'connect';
    const connecting = pool.connect().then(value => {
      if (aborted) { try { value.release(true); } catch {} throw new Error('Diagnostic timeout'); }
      return value;
    });
    client = await bounded(connecting, 5500);
    client.on('error', markError);
    stage = 'tls_unverified'; phase = 'tls_verification';
    const stream = client.connection?.stream;
    if (stream?.encrypted !== true || stream?.authorized !== true ||
      !['TLSv1.2', 'TLSv1.3'].includes(stream.getProtocol?.())) throw new Error('Diagnostic unavailable');
    transport = 'verified';
    // The upstream socket normally auto-releases after every statement. Hold a
    // single checkout through this proxy and destroy it exactly once in finally.
    connection = { query: client.query.bind(client), release: noop, transaction: 1 };
    stage = 'read_only_unconfirmed'; phase = 'read_only_check';
    begun = true;
    await query('BEGIN READ ONLY');
    const state = await query('SHOW transaction_read_only');
    if (!Array.isArray(state?.rows) || state.rows.length !== 1 || state.rows[0].transaction_read_only !== 'on') throw new Error('Diagnostic unavailable');
    stage = 'query_failed'; phase = 'catalog_query';
    const catalog = await query(CATALOG_SQL);
    const tables = classifyCatalog(catalog?.rows);
    result = fixedResult(TABLES.every(name => tables[name] === 'readable') ? 'ok' : 'schema_incomplete', transport, tables);
  } catch (error) {
    const detail = failureDetail(error,phase,aborted);
    const status = detail.timeout ? 'timeout' : stage;
    result = fixedResult(status, transport, undefined, classifyFailure(error,status),phase,detail.reason,detail.setting);
  } finally {
    let cleanupFailed = false;
    if (begun && connection && !aborted) {
      try { await bounded(socket.query({ sql: 'ROLLBACK', debounce: false }, connection), 3500); }
      catch { cleanupFailed = true; }
    }
    if (client) {
      try { client.release(true); } catch { cleanupFailed = true; }
    }
    if (socket && pool) {
      try { await bounded(socket.close(), 2000); } catch { cleanupFailed = true; }
    }
    // Keep safe error listeners on disposed resources for late driver events.
    // No listener serializes the error or emits it to a log/HTTP response.
    if (cleanupFailed || asynchronousError) result = fixedResult('cleanup_or_transport_failed', transport, undefined, 'cleanup','cleanup',aborted ? 'deadline_timeout' : 'unknown');
  }
  return result;
}
module.exports = { createPostgresqlOptions, runPostgresqlDiagnostic };
