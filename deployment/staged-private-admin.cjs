'use strict';
// AGPL-3.0-or-later. Public and previous diagnostic entrypoints remain inert.
// SECURITY PRECONDITION: verified Vercel protection, no bypass/share exception,
// no public alias. These routing checks are containment, not authentication.
// One startup event per warm handler contains fixed labels/booleans only.
const disabled = require('../index.cjs');
const PROJECT = 'prj_NtBPfOSSwqaOLH0tejtx7Da5eE9Q';
const HOST = /^mantou-comments-[a-z0-9]+-mantous-projects-af7e7067\.vercel\.app$/;
const ROUTES = new Set(['/__private', '/__private/access', '/__private/setup', '/__private/login', '/__private/logout']);
const ROUTE_CLASS = Object.freeze({ '/__private': 'home', '/__private/access': 'access', '/__private/setup': 'setup', '/__private/login': 'login', '/__private/logout': 'logout', '/api/private-admin': 'function_endpoint' });
function routeClass(value) {
  if (typeof value !== 'string') return 'other';
  if (Object.hasOwn(ROUTE_CLASS, value)) return ROUTE_CLASS[value];
  if (value.includes('?') && Object.hasOwn(ROUTE_CLASS, value.split('?', 1)[0])) return 'query_attached';
  if (value.endsWith('/') && Object.hasOwn(ROUTE_CLASS, value.slice(0, -1))) return 'trailing_slash';
  return 'other';
}
function expiry(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.000)?Z$/.test(value)) return NaN;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z') ? timestamp : NaN;
}
function configurationChecks(environment, expiresAt) {
  // Mirror the existing constructor predicates for reporting only. They never
  // authorize a request or replace the constructor's validation. Nothing here
  // returns values, lengths, hashes, identities or exception details.
  const { createHash, timingSafeEqual } = require('node:crypto');
  const email = environment.PRIVATE_ADMIN_EMAIL;
  const name = environment.PRIVATE_ADMIN_DISPLAY_NAME;
  const owner = environment.PRIVATE_ADMIN_ACCESS_KEY;
  const signing = environment.JWT_TOKEN;
  const keyShape = value => typeof value === 'string' && /^[\x21-\x7e]{43,1024}$/.test(value);
  const digest = value => createHash('sha256').update(value).digest();
  const now = Date.now();
  return {
    expiry_future: expiresAt > now,
    expiry_within_24h: expiresAt <= now + 86400000,
    identity_email_shape: typeof email === 'string' && email.length <= 255 && /^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+\.[^\s@\u0000-\u001f\u007f]+$/.test(email),
    identity_name_shape: typeof name === 'string' && Boolean(name.trim()) && [...name].length <= 255 && !/[\u0000-\u001f\u007f]/.test(name),
    owner_key_shape: keyShape(owner),
    signing_key_shape: keyShape(signing),
    keys_distinct: typeof owner === 'string' && typeof signing === 'string' && !timingSafeEqual(digest(owner), digest(signing)),
  };
}

function createStagedPrivateAdmin(environment, dependencies = {}) {
  let page, reported = false;
  return async function stagedPrivateAdmin(req, res) {
    let phase = 'guard', classification = 'other';
    const checks = {};
    function report(outcome) {
      if (reported) return;
      reported = true;
      const event = Object.freeze({ event: 'mantou_private_startup', version: 1, phase, outcome, routeClass: classification, checks: Object.freeze({ ...checks }) });
      try {
        const result = typeof dependencies.reportStartup === 'function'
          ? dependencies.reportStartup(event) : console.info(JSON.stringify(event));
        Promise.resolve(result).catch(() => {});
      } catch { /* Reporting must never change request behavior. */ }
    }
    try {
      classification = routeClass(req?.url);
      checks.environment_present = Boolean(environment);
      if (!environment) { report('blocked'); return disabled(req, res); }
      // Vercel's default Node helpers buffer bodies before this handler.
      const guard = (name, value) => { checks[name] = value; return value; };
      if (!guard('helpers_disabled', environment.NODEJS_HELPERS === '0') ||
          !guard('production', environment.VERCEL_ENV === 'production') ||
          !guard('project_matches', environment.VERCEL_PROJECT_ID === PROJECT) ||
          !guard('private_enabled', environment.PRIVATE_ADMIN_ENABLED === 'true') ||
          !guard('generated_url_valid', typeof environment.VERCEL_URL === 'string' && HOST.test(environment.VERCEL_URL)) ||
          !guard('host_matches', req?.headers?.host === environment.VERCEL_URL) ||
          !guard('method_allowed', ['GET', 'POST'].includes(req?.method)) ||
          !guard('path_allowed', ROUTES.has(req?.url))) {
        report('blocked'); return disabled(req, res);
      }
      phase = 'expiry';
      const expiresAt = expiry(environment.PRIVATE_ADMIN_EXPIRES_AT);
      checks.expiry_format = Number.isFinite(expiresAt);
      if (!checks.expiry_format) { report('blocked'); return disabled(req, res); }
      if (!page) {
        phase = 'adapter_module';
        const createAdapter = dependencies.createAdapter ?? require('../src/private-postgresql-adapter.cjs').createPrivatePostgresqlAdapter;
        checks.adapter_module_loaded = true;
        phase = 'page_module';
        const createPage = dependencies.createPage ?? require('../src/private-admin-page.cjs').createPrivateAdminPage;
        checks.page_module_loaded = true;
        phase = 'adapter_factory';
        const adapter = createAdapter({ environment: () => environment });
        checks.adapter_created = true;
        phase = 'page_factory';
        Object.assign(checks, configurationChecks(environment, expiresAt));
        page = createPage({
          origin: `https://${environment.VERCEL_URL}`,
          identity: { email: environment.PRIVATE_ADMIN_EMAIL, displayName: environment.PRIVATE_ADMIN_DISPLAY_NAME },
          ownerAccessKey: environment.PRIVATE_ADMIN_ACCESS_KEY,
          jwtSecret: environment.JWT_TOKEN,
          expiresAt,
          getModels: () => adapter.getModels(),
          acquireBootstrap: () => adapter.acquireBootstrap(),
        });
        checks.page_created = true;
      }
      phase = 'dispatch';
      await page(req, res);
      phase = 'ready';
      report('ready');
    } catch {
      report('error');
      // No submitted body, identity, secret, SQL, driver detail or stack escapes.
      if (!res.headersSent) disabled(req, res);
      else if (!res.writableEnded) res.end();
    }
  };
}
// Import-time construction reads no environment property and opens no socket.
module.exports = createStagedPrivateAdmin(process.env);
module.exports.createStagedPrivateAdmin = createStagedPrivateAdmin;
