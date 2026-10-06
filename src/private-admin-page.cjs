'use strict';
// Local preparation only. AGPL-3.0-or-later. Nothing imports or mounts this
// factory from the public entry point. No environment, accounts, or connections
// are accessed on import. The caller must independently enforce verified
// platform protection on the exact generated HTTPS deployment origin.
// The owner-held access key is a separate capability, NOT platform visitor
// identity. Supply it and a distinct signing secret only after authorization.
// expiresAt is a REQUIRED absolute Unix timestamp in milliseconds, at most
// 24 hours ahead when constructed. Retired
// immutable deployments therefore cannot accept their old keys indefinitely.
// Distributed abuse protection belongs at the protected deployment boundary.
const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const { createRequire } = require('node:module');
const jwt = require('jsonwebtoken');
const { PasswordHash } = require('phpass');
const { createPrivateAdministratorBootstrap } = require('./private-admin-bootstrap.cjs');

const OWNER_COOKIE = '__Host-mantou-owner';
const ADMIN_COOKIE = '__Host-mantou-admin';
const TTL = 900;
const MAX_BODY = 4096;
const BODY_READ_TIMEOUT_MS = 5000;
const ROUTES = new Set(['/__private/access', '/__private/setup', '/__private/login', '/__private', '/__private/logout']);
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const digest = value => createHash('sha256').update(value).digest();
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && timingSafeEqual(digest(a), digest(b));
const validPassword = value => typeof value === 'string' && value.length > 0 && Buffer.byteLength(value, 'utf8') <= 72 && !value.includes('\0');
const validSubject = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

function send(res, status, title, body = '') {
  res.statusCode = status;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('pragma', 'no-cache');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'same-origin');
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('content-security-policy', "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'");
  res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>' + escapeHtml(title) + '</title></head><body><main><h1>' + escapeHtml(title) + '</h1>' + body + '</main><footer><p><a href="https://github.com/Maoxin1/mantou-comments" rel="noreferrer">Source and licenses</a></p></footer></body></html>');
}
const deny = (res, status = 403) => send(res, status, status === 404 ? 'Not found' : 'Request unavailable');
function redirect(res, location) { res.setHeader('location', location); send(res, 303, 'Continue'); }
function cookie(name, token, age) {
  // __Host- requires Secure, Path=/, and NO Domain attribute.
  return `${name}=${token}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Strict`;
}
function readCookie(req, name) {
  const header = req.headers?.cookie;
  if (typeof header !== 'string' || header.length > 16384) return null;
  const values = header.split(';').map(part => part.trim()).filter(part => part.startsWith(name + '='));
  if (values.length !== 1) return null;
  const value = values[0].slice(name.length + 1);
  return value.length > 0 && value.length <= 4096 ? value : null;
}
class RequestError extends Error { constructor(status) { super('Invalid request'); this.status = status; } }
async function readForm(req, fields) {
  if (typeof req.headers['content-type'] !== 'string' || !/^application\/x-www-form-urlencoded(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type'])) throw new RequestError(415);
  const length = req.headers['content-length'];
  if (req.headers['transfer-encoding'] !== undefined || typeof length !== 'string' || !/^(0|[1-9]\d*)$/.test(length)) throw new RequestError(400);
  if (Number(length) > MAX_BODY) throw new RequestError(413);
  const chunks = [];
  let size = 0;
  let timer;
  try {
    await Promise.race([
      (async () => {
        for await (const chunk of req) {
          size += chunk.length;
          if (size > MAX_BODY) throw new RequestError(413);
          chunks.push(chunk);
        }
      })(),
      new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new RequestError(408)), BODY_READ_TIMEOUT_MS);
      }),
    ]);
  } finally { clearTimeout(timer); }
  if (size !== Number(length)) throw new RequestError(400);
  let raw;
  try { raw = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); }
  catch { throw new RequestError(400); }
  // URLSearchParams tolerates malformed percent sequences; reject them first.
  try { decodeURIComponent(raw.replace(/\+/g, ' ')); } catch { throw new RequestError(400); }
  const form = new URLSearchParams(raw);
  const entries = [...form.entries()];
  if (entries.length !== fields.length || fields.some(name => form.getAll(name).length !== 1) || entries.some(([name]) => !fields.includes(name))) throw new RequestError(400);
  return Object.fromEntries(entries);
}

function createPrivateAdminPage({ origin, identity, ownerAccessKey, jwtSecret, expiresAt, getModels, acquireBootstrap, moderationEnabled = false, moderationPaths = null } = {}) {
  let url;
  try { url = new URL(origin); } catch { /* validated below */ }
  if (!url || url.protocol !== 'https:' || url.origin !== origin || url.username || url.password ||
      !identity || typeof identity.email !== 'string' || identity.email.length > 255 ||
      !/^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+\.[^\s@\u0000-\u001f\u007f]+$/.test(identity.email) ||
      typeof identity.displayName !== 'string' || !identity.displayName.trim() || [...identity.displayName].length > 255 || /[\u0000-\u001f\u007f]/.test(identity.displayName) ||
      typeof ownerAccessKey !== 'string' || !/^[\x21-\x7e]{43,1024}$/.test(ownerAccessKey) ||
      typeof jwtSecret !== 'string' || !/^[\x21-\x7e]{43,1024}$/.test(jwtSecret) || equal(ownerAccessKey, jwtSecret) ||
      !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + 86400000 ||
      typeof getModels !== 'function' || typeof acquireBootstrap !== 'function' || typeof moderationEnabled !== 'boolean' ||
      (moderationPaths !== null && (!Array.isArray(moderationPaths) || !moderationPaths.length || moderationPaths.length > 8 || moderationPaths.some(p => typeof p !== 'string' || !/^\/(?:p|works)\/[^/?#\u0000-\u0020]+\/$/.test(p))))) {
    throw new TypeError('Invalid private administrator configuration');
  }
  const accountIdentity = Object.freeze({ email: identity.email, displayName: identity.displayName });
  const moderationThreads = moderationPaths === null ? null : new Set(moderationPaths);
  const audience = origin + '/__private';
  const password = new PasswordHash();
  let modelPromise;
  const models = () => modelPromise ??= Promise.resolve().then(getModels).then(value => {
    if (!value || !['Users', 'Comment', 'Counter'].every(name => value[name] && typeof value[name].select === 'function')) throw new Error('Unavailable models');
    return value;
  });
  const secondsRemaining = () => Math.max(0, Math.min(TTL, Math.floor(expiresAt / 1000) - Math.floor(Date.now() / 1000)));
  function sign(purpose, data, ttl = TTL) {
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign({ ...data, purpose, iat: now, exp: Math.min(now + ttl, Math.floor(expiresAt / 1000)) }, jwtSecret, {
      algorithm: 'HS256', issuer: origin, audience,
    });
  }
  function verify(token, purpose) {
    if (Date.now() >= expiresAt || typeof token !== 'string') return null;
    try {
      const value = jwt.verify(token, jwtSecret, { algorithms: ['HS256'], issuer: origin, audience, maxAge: TTL + 's' });
      const now = Math.floor(Date.now() / 1000);
      return value && typeof value === 'object' && value.purpose === purpose &&
        Number.isInteger(value.iat) && value.iat <= now && Number.isInteger(value.exp) &&
        value.exp <= Math.floor(expiresAt / 1000) && value.exp > value.iat ? value : null;
    } catch { return null; }
  }
  function ownerFor(req) {
    const owner = verify(readCookie(req, OWNER_COOKIE), 'owner');
    return owner && /^[a-f0-9]{64}$/.test(owner.jti) ? owner : null;
  }
  function csrf(owner, path) { return sign('csrf', { sub: owner.jti, path }, 300); }
  function checkCsrf(value, owner, path) {
    const proof = verify(value, 'csrf');
    return proof && equal(proof.sub, owner.jti) && proof.path === path;
  }
  const hiddenCsrf = (owner, path) => '<input type="hidden" name="csrf" value="' + escapeHtml(csrf(owner, path)) + '">';
  const logoutForm = owner => '<form method="post" action="/__private/logout">' + hiddenCsrf(owner, '/__private/logout') + '<button type="submit">Sign out</button></form>';
  async function coreFor(owner) {
    const core = createRequire(require.resolve('@waline/vercel/package.json'))('@waline/core');
    return core.createWalineCore({
      models: await models(),
      config: { audit: true, disableRegion: true, disableUserAgent: true },
      // No signup, OAuth, avatar fetch, mail, reset, two-factor mutation, or
      // notification capability is provided or routed.
      services: {
        password: { verify: (plain, hash) => password.checkPasswordAsync(plain, hash) },
        token: {
          sign(subject) {
            const sub = String(subject);
            if (!validSubject(sub)) throw new Error('Invalid subject');
            return sign('admin', { sub, owner: owner.jti });
          },
          verify(token) {
            const session = verify(token, 'admin');
            if (!session || !validSubject(session.sub) || !equal(session.owner, owner.jti)) throw new Error('Invalid session');
            return session.sub;
          },
        },
      },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    });
  }
  const context = () => ({ state: { oauthServices: [] }, headers: {} });
  const isApprovedAdmin = account => account?.email === accountIdentity.email && account?.type === 'administrator' && validSubject(String(account.objectId));

  return async function privateAdminPage(req, res) {
    try {
      if (Date.now() >= expiresAt || secondsRemaining() < 1 || req.headers?.host !== url.host) return deny(res);
      if (!ROUTES.has(req.url)) return deny(res, 404);
      if (!['GET', 'POST'].includes(req.method)) return deny(res, 405);
      if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) return deny(res);
      if (req.method === 'POST' && req.headers.origin !== origin) return deny(res);
      if (req.url === '/__private/access') {
        if (req.method === 'GET') return send(res, 200, 'Private administrator access', '<p>Enter your separately provided owner access key.</p><form method="post" action="/__private/access"><label>Owner access key <input type="password" name="ownerAccessKey" autocomplete="off" required maxlength="1024"></label><button type="submit">Continue</button></form>');
        const form = await readForm(req, ['ownerAccessKey']);
        if (!equal(form.ownerAccessKey, ownerAccessKey)) return deny(res);
        form.ownerAccessKey = undefined;
        const token = sign('owner', { jti: randomBytes(32).toString('hex') });
        res.setHeader('set-cookie', [cookie(OWNER_COOKIE, token, secondsRemaining()), cookie(ADMIN_COOKIE, '', 0)]);
        return redirect(res, '/__private/login');
      }
      // Check the owner-held capability BEFORE reading any password or storage.
      const owner = ownerFor(req);
      if (!owner) return deny(res);
      if (req.url === '/__private/setup') {
        if (req.method === 'GET') {
          const store = await models();
          const existing = await store.Users.select({}, { limit: 1, field: ['id'] });
          if (!Array.isArray(existing)) throw new Error('Unavailable users');
          if (existing.length) return send(res, 409, 'Administrator setup is closed', '<p><a href="/__private/login">Sign in</a></p>' + logoutForm(owner));
          return send(res, 200, 'Set up administrator', '<p>Email: ' + escapeHtml(accountIdentity.email) + '</p><p>Name: ' + escapeHtml(accountIdentity.displayName) + '</p><p>Choose at least 12 characters and at most 72 UTF-8 bytes. The approved identity cannot be changed here.</p><form method="post" action="/__private/setup">' + hiddenCsrf(owner, '/__private/setup') + '<label>Password <input type="password" name="password" autocomplete="new-password" required minlength="12" maxlength="72"></label><label>Confirm password <input type="password" name="confirmPassword" autocomplete="new-password" required minlength="12" maxlength="72"></label><button type="submit">Create administrator</button></form><p><a href="/__private/login">Back to sign in</a></p>' + logoutForm(owner));
        }
        const form = await readForm(req, ['csrf', 'password', 'confirmPassword']);
        if (!checkCsrf(form.csrf, owner, req.url)) return deny(res);
        const bootstrap = createPrivateAdministratorBootstrap({
          authorize: () => Date.now() < expiresAt && Boolean(ownerFor(req)),
          expectedEmail: accountIdentity.email,
          acquire: () => {
            if (Date.now() >= expiresAt || !ownerFor(req)) throw new Error('Expired access');
            return acquireBootstrap();
          },
        });
        const result = await bootstrap({ readInput: () => ({ ...accountIdentity, password: form.password, confirmPassword: form.confirmPassword }) });
        form.password = form.confirmPassword = undefined;
        if (result.status === 'created') {
          res.setHeader('set-cookie', [cookie(ADMIN_COOKIE, '', 0)]);
          return redirect(res, '/__private/login');
        }
        if (result.status === 'invalid_input') return deny(res, 400);
        if (result.status === 'denied') return deny(res);
        if (result.status === 'blocked_nonempty') return send(res, 409, 'Administrator setup is closed', '<p><a href="/__private/login">Sign in</a></p>');
        return send(res, 503, 'Setup could not be confirmed', '<p>Do not submit setup again until an authorized read-only account check resolves the outcome.</p>');
      }
      if (req.url === '/__private/login') {
        if (req.method === 'GET') return send(res, 200, 'Administrator sign in', '<p>' + escapeHtml(accountIdentity.email) + '</p><form method="post" action="/__private/login">' + hiddenCsrf(owner, '/__private/login') + '<label>Password <input type="password" name="password" autocomplete="current-password" required maxlength="72"></label><button type="submit">Sign in</button></form><p><a href="/__private/setup">First-time setup</a></p>' + logoutForm(owner));
        const form = await readForm(req, ['csrf', 'password']);
        if (!checkCsrf(form.csrf, owner, req.url)) return deny(res);
        if (!validPassword(form.password)) return deny(res, 400);
        const core = await coreFor(owner);
        let account;
        try {
          account = await core.auth.login({ email: accountIdentity.email, password: form.password }, context());
        } catch (error) {
          if (['LOGIN_FAILED', 'TWO_FACTOR_AUTH_ERROR', 'CAPABILITY_UNAVAILABLE'].includes(error?.code)) return deny(res, 401);
          throw error;
        } finally { form.password = undefined; }
        if (!isApprovedAdmin(account)) return deny(res, 401);
        // Resolve again from storage instead of trusting a role inside any JWT.
        const resolved = await core.auth.resolveSession({ token: account.token }, context());
        if (!isApprovedAdmin(resolved)) return deny(res, 401);
        res.setHeader('set-cookie', [cookie(ADMIN_COOKIE, account.token, secondsRemaining())]);
        return redirect(res, '/__private');
      }
      if (req.url === '/__private/logout') {
        if (req.method !== 'POST') return deny(res, 405);
        const form = await readForm(req, ['csrf']);
        if (!checkCsrf(form.csrf, owner, req.url)) return deny(res);
        // Browser sign-out only. These stateless cookies have no server-side
        // revocation record: a copied owner/admin pair remains usable until its
        // short token expiry or the absolute deployment expiry, whichever is
        // earlier (subject to the database role/email checks on every use).
        res.setHeader('set-cookie', [cookie(OWNER_COOKIE, '', 0), cookie(ADMIN_COOKIE, '', 0)]);
        return redirect(res, '/__private/access');
      }
      if (req.method !== 'GET' && !(moderationEnabled && req.method === 'POST')) return deny(res, 405);
      const token = readCookie(req, ADMIN_COOKIE);
      const proof = verify(token, 'admin');
      if (!proof || !equal(proof.owner, owner.jti) || !validSubject(proof.sub)) return deny(res, 401);
      const core = await coreFor(owner);
      const adminContext = context();
      const account = await core.auth.resolveSession({ token }, adminContext);
      if (!isApprovedAdmin(account)) return deny(res, 401);
      if (moderationEnabled) {
        adminContext.state.userInfo = account;
        if (req.method === 'POST') {
          const form = await readForm(req, ['csrf', 'objectId']);
          if (!checkCsrf(form.csrf, owner, '/__private')) return deny(res);
          if (!validSubject(form.objectId)) return deny(res, 400);
          const store = await models();
          const rows = await store.Comment.select({ objectId: form.objectId }, { limit: 1, field: ['objectId', 'status', 'url'] });
          if (!Array.isArray(rows) || rows.length !== 1) return deny(res, 404);
          if (moderationThreads && !moderationThreads.has(rows[0].url)) return deny(res);
          if (rows[0].status !== 'waiting') return send(res, 409, 'Comment is no longer waiting', '<p><a href="/__private">Back to moderation</a></p>' + logoutForm(owner));
          try {
            // Only this status transition is exposed. No edit, delete, account,
            // notification or public-reader capability is added by this page.
            await core.comment.update({ objectId: form.objectId, data: { status: 'approved' } }, adminContext);
          } catch {
            return send(res, 503, 'Approval result is unknown', '<p>Do not submit approval again until an authorized read-only comment check resolves the outcome.</p>' + logoutForm(owner));
          }
          return redirect(res, '/__private');
        }
        const queue = await core.comment.listForAdmin({ status: 'waiting', page: 1, pageSize: 20 }, adminContext);
        if (!queue || !Array.isArray(queue.data) || queue.data.length > 20) throw new Error('Unavailable moderation queue');
        const entries = queue.data.map(row => {
          if (moderationThreads && !moderationThreads.has(row.url)) throw new Error('Comment outside acceptance scope');
          if (!validSubject(String(row.objectId)) || row.status !== 'waiting') throw new Error('Unavailable comment');
          const parent = row.pid ? 'Reply to ' + escapeHtml(row.pid) : 'Root comment';
          return '<li><h3>Comment ' + escapeHtml(row.objectId) + '</h3><p>' + parent + '</p><p>Page: <code>' + escapeHtml(row.url ?? '') + '</code></p><p>Reader: ' + escapeHtml(row.nick ?? '') + '</p><pre>' + escapeHtml(String(row.comment ?? '').slice(0, 2000)) + '</pre><form method="post" action="/__private">' + hiddenCsrf(owner, '/__private') + '<input type="hidden" name="objectId" value="' + escapeHtml(row.objectId) + '"><button type="submit">Approve comment ' + escapeHtml(row.objectId) + '</button></form></li>';
        }).join('');
        return send(res, 200, 'Signed in', '<p>Administrator: ' + escapeHtml(accountIdentity.displayName) + '</p><h2>Waiting comments</h2><p>Only approval is available. The queue shows at most 20 waiting comments; reader email and network metadata are not displayed.</p>' + (entries ? '<ol>' + entries + '</ol>' : '<p>No waiting comments.</p>') + logoutForm(owner));
      }
      return send(res, 200, 'Signed in', '<p>Administrator: ' + escapeHtml(accountIdentity.displayName) + '</p><p>Private administrator authentication is ready. Moderation controls are not included in this staged page.</p>' + logoutForm(owner));
    } catch (error) {
      if (error instanceof RequestError) {
        // Do not keep a partially consumed or stalled request alive. Destroy
        // only after the error response flushes, so clients can receive it.
        res.setHeader('connection', 'close');
        res.once?.('finish', () => req.destroy?.());
      }
      return deny(res, error instanceof RequestError ? error.status : 503);
    }
  };
}

module.exports = { createPrivateAdminPage };
