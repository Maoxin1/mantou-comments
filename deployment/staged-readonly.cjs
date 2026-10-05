'use strict';
// Diagnostic-only deployment adapter, AGPL-3.0-or-later.
// SECURITY PRECONDITION: verified Vercel Authentication protects the generated
// deployment URL. The checks below are routing/CSRF guards, NOT authentication.
// Never expose this artifact through a protection exception or production alias.
const disabled = require('../index.cjs');
const { createProtectedDiagnosticHandler } = require('../src/protected-diagnostic-handler.cjs');
const PROJECT_ID = 'prj_NtBPfOSSwqaOLH0tejtx7Da5eE9Q';
function createStagedHandler(environment) {
  function eligible(req) {
    return environment.VERCEL_ENV === 'production' && environment.VERCEL_PROJECT_ID === PROJECT_ID &&
      typeof environment.VERCEL_URL === 'string' && /^mantou-comments-[a-z0-9]+-mantous-projects-af7e7067\.vercel\.app$/.test(environment.VERCEL_URL) &&
      req.headers?.host === environment.VERCEL_URL;
  }
  const run = createProtectedDiagnosticHandler({
    authorize: req => eligible(req) && req.headers?.origin === `https://${environment.VERCEL_URL}`,
    environment: () => environment,
  });
  return async function stagedDiagnostic(req, res) {
    if (!eligible(req)) return disabled(req, res);
    if (req.url === '/__diagnostics/report') {
      const report = require('../src/diagnostic-report.cjs');
      if (req.method === 'GET') return report.renderDiagnosticReportForm(res);
      if (req.method !== 'POST') return disabled(req,res);
      // Reuse the exact original authorization/framing checks and one-shot
      // diagnostic; only presentation changes. This adapter reads no body.
      const capture = {
        statusCode: 503,
        setHeader() {},
        end(body) { report.renderDiagnosticReport(res,report.projectDiagnosticReport(body,this.statusCode)); },
      };
      return run({ method:req.method, url:'/__diagnostics/postgresql', headers:req.headers },capture);
    }
    if (req.method === 'GET' && req.url === '/__diagnostics') {
      res.statusCode = 200;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.setHeader('x-content-type-options', 'nosniff');
      res.setHeader('referrer-policy', 'same-origin');
      res.setHeader('content-security-policy', "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
      res.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Read-only database diagnostic</title><h1>Read-only database diagnostic</h1><p>One connection and expected-table permission check. No row reads, writes, schema changes or administrator setup.</p><form method="post" action="/__diagnostics/postgresql"><button type="submit">Run read-only check</button></form><p><a href="https://github.com/Maoxin1/mantou-comments">Source and licenses</a></p></html>');
      return;
    }
    return run(req, res);
  };
}
module.exports = createStagedHandler(process.env);
module.exports.createStagedHandler = createStagedHandler;
