'use strict';
// Local preparation only, 2026-10-06. AGPL-3.0-or-later.
// This file is not referenced by the current production or diagnostic profile.
// SECURITY PRECONDITION before future use: independently verify deployment
// protection, no bypass/share exception, and no public alias. Host/environment
// matching below is containment, not proof of the visitor's identity. The page
// adds the separately approved owner-held capability and administrator login.
const disabled = require('../index.cjs');
const PROJECT = 'prj_NtBPfOSSwqaOLH0tejtx7Da5eE9Q';
const HOST = /^mantou-comments-[a-z0-9]+-mantous-projects-af7e7067\.vercel\.app$/;
const ROUTES = new Set(['/__private', '/__private/access', '/__private/setup', '/__private/login', '/__private/logout']);
function expiry(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.000)?Z$/.test(value)) return NaN;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z') ? timestamp : NaN;
}

function createStagedPrivateAdmin(environment, dependencies = {}) {
  let page;
  return async function stagedPrivateAdmin(req, res) {
    try {
      // Vercel's default Node helpers buffer request bodies before the handler.
      // Their documented opt-out preserves this page's owner-before-body gate.
      if (!environment || environment.NODEJS_HELPERS !== '0' || environment.VERCEL_ENV !== 'production' || environment.VERCEL_PROJECT_ID !== PROJECT ||
          environment.PRIVATE_ADMIN_ENABLED !== 'true' || typeof environment.VERCEL_URL !== 'string' ||
          !HOST.test(environment.VERCEL_URL) || req.headers?.host !== environment.VERCEL_URL ||
          !['GET', 'POST'].includes(req.method) || !ROUTES.has(req.url)) return disabled(req, res);
      const expiresAt = expiry(environment.PRIVATE_ADMIN_EXPIRES_AT);
      if (!Number.isFinite(expiresAt)) return disabled(req, res);
      if (!page) {
        const createAdapter = dependencies.createAdapter ?? require('../src/private-postgresql-adapter.cjs').createPrivatePostgresqlAdapter;
        const createPage = dependencies.createPage ?? require('../src/private-admin-page.cjs').createPrivateAdminPage;
        const adapter = createAdapter({ environment: () => environment });
        page = createPage({
          origin: `https://${environment.VERCEL_URL}`,
          identity: { email: environment.PRIVATE_ADMIN_EMAIL, displayName: environment.PRIVATE_ADMIN_DISPLAY_NAME },
          ownerAccessKey: environment.PRIVATE_ADMIN_ACCESS_KEY,
          jwtSecret: environment.JWT_TOKEN,
          expiresAt,
          getModels: () => adapter.getModels(),
          acquireBootstrap: () => adapter.acquireBootstrap(),
        });
      }
      await page(req, res);
    } catch {
      // No submitted body, identity, secret, SQL, driver detail or stack escapes.
      if (!res.headersSent) disabled(req, res);
      else if (!res.writableEnded) res.end();
    }
  };
}
// Import-time construction reads no configuration property and opens no socket.
module.exports = createStagedPrivateAdmin(process.env);
module.exports.createStagedPrivateAdmin = createStagedPrivateAdmin;
