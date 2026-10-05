'use strict';
// This factory is not a platform-auth implementation. The trusted server-side
// authorize callback must be separately reviewed against real deployment
// protection. An HTTP header, environment flag or hidden URL is not proof.
const disabled = require('../index.cjs');
function createProtectedDiagnosticHandler({ authorize, environment } = {}) {
  let diagnostic;
  return async function protectedDiagnostic(req, res) {
    const headers = req.headers || {};
    if (req.method !== 'POST' || req.url !== '/__diagnostics/postgresql' ||
      headers['transfer-encoding'] !== undefined ||
      (headers['content-length'] !== undefined && headers['content-length'] !== '0') ||
      typeof authorize !== 'function' || typeof environment !== 'function') return disabled(req, res);
    try { if (await authorize(req) !== true) return disabled(req, res); }
    catch { return disabled(req, res); }
    // Once per warm instance; no automatic retries or overlapping connections.
    // This is not a cross-instance quota; deployment access must remain private.
    diagnostic ??= Promise.resolve().then(() => require('./postgresql-diagnostic.cjs').runPostgresqlDiagnostic(environment()))
      .catch(() => ({ status: 'configuration_invalid', transport: 'unconfirmed' }));
    const result = await diagnostic;
    res.statusCode = result.status === 'ok' || result.status === 'schema_incomplete' ? 200 : 503;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    res.end(JSON.stringify(result));
  };
}
module.exports = { createProtectedDiagnosticHandler };
