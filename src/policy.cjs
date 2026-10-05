'use strict';
// This is a narrow anonymous-reader candidate, not the administrator API.
// Unknown/side endpoints remain closed until their SPEC GAPs are resolved.
const COMMENT_FIELDS = new Set(['objectId', 'nick', 'link', 'comment', 'status', 'url', 'pid', 'rid', 'time', 'like', 'sticky', 'type', 'label', 'level']);
const PROFILE_FIELDS = new Set(['nick', 'link']);
const META_FIELDS = new Set(['page', 'totalPages', 'pageSize', 'count']);
const STATIC_AVATAR = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E';
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
function scalars(source, fields) {
  const result = {};
  for (const key of fields) {
    const value = source[key];
    if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) result[key] = value;
  }
  return result;
}
function projectComment(source) {
  if (!isRecord(source)) return {};
  const result = scalars(source, COMMENT_FIELDS);
  result.avatar = STATIC_AVATAR;
  if (Array.isArray(source.children)) result.children = source.children.map(projectComment);
  if (isRecord(source.reply_user)) result.reply_user = { ...scalars(source.reply_user, PROFILE_FIELDS), avatar: STATIC_AVATAR };
  return result;
}
function projectData(data) {
  if (typeof data === 'number') return data;
  if (Array.isArray(data)) return data.map((item) => typeof item === 'number' ? item : projectComment(item));
  if (!isRecord(data)) return null;
  if (Array.isArray(data.data)) return { ...scalars(data, META_FIELDS), data: data.data.map(projectComment) };
  return projectComment(data);
}
function projectPublicResponse(body) {
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return { errno: 500, errmsg: 'Comment result is unknown' }; }
  }
  if (!isRecord(body) || body.errno !== 0) {
    return { errno: Number.isInteger(body?.errno) && body.errno !== 0 ? body.errno : 500, errmsg: 'Comment request could not be completed; save status may be unknown' };
  }
  return { errno: 0, data: projectData(body.data) };
}
function allowedRequest(req) {
  let url;
  try { url = new URL(req.url, 'http://local.invalid'); } catch { return false; }
  if (url.pathname !== '/api/comment' || !['GET', 'POST', 'OPTIONS'].includes(req.method)) return false;
  if (req.headers.authorization || url.searchParams.has('state') || url.searchParams.has('method') || url.searchParams.has('id')) return false;
  const allowedQuery = req.method === 'GET'
    ? new Set(['path', 'type', 'url', 'page', 'pageSize', 'sortBy', 'lang'])
    : new Set(['lang']);
  if ([...url.searchParams.keys()].some((key) => !allowedQuery.has(key))) return false;
  const type = url.searchParams.get('type');
  return type === null || type === 'count';
}
function reject(res) {
  res.statusCode = 403;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify({ errno: 403, errmsg: 'This endpoint is not enabled' }));
}
function createPublicMiddleware() {
  return async function publicResponseBoundary(ctx, next) {
    ctx.set('cache-control', 'no-store');
    // ThinkJS supports method overrides; the resulting action is checked too.
    if (!['get', 'post'].includes(ctx.action)) {
      ctx.status = 403;
      ctx.body = { errno: 403, errmsg: 'This endpoint is not enabled' };
      return;
    }
    try {
      await next();
    } catch (error) {
      // Successful ThinkJS controller responses intentionally throw this sentinel.
      if (!think.isPrevent(error)) {
        ctx.status = 500;
        ctx.body = { errno: 500, errmsg: 'Comment result is unknown' };
      }
    } finally {
      ctx.body = projectPublicResponse(ctx.body);
    }
  };
}
const OUTBOUND_CONFIG = /^(?:SMTP_|WEBHOOK$|SC_KEY$|QYWX_AM$|QMSG_KEY$|TG_BOT_TOKEN$|PUSH_PLUS_KEY$|DISCORD_WEBHOOK$|LARK_WEBHOOK$|RECAPTCHA_V3_SECRET$|TURNSTILE_SECRET$)/;
function assertIsolatedEnvironment(env) {
  const blocked = Object.keys(env).filter((key) => OUTBOUND_CONFIG.test(key) && env[key]);
  if (blocked.length) throw new Error(`Unapproved outbound configuration: ${blocked.join(', ')}`);
  const storage = Object.keys(env).filter(key => /^(?:PG_|POSTGRES_|LEAN_|TCB_|TENCENTCLOUD_|MONGO_|MYSQL_|TIDB_|GITHUB_TOKEN$)/.test(key) && env[key]);
  if (storage.length) throw new Error('External storage is forbidden in the isolated candidate');
  if (env.SQLITE_PATH && env.SQLITE_PATH !== '/tmp/mantou-waline-in-memory-fixture-only') throw new Error('Only the synthetic memory-model fixture is permitted');
  if (env.LOGIN === 'force') throw new Error('Reader login must not be required');
  if (env.AKISMET_KEY !== 'false') throw new Error('External spam service remains unapproved');
}
module.exports = { projectComment, projectPublicResponse, allowedRequest, reject, createPublicMiddleware, assertIsolatedEnvironment, STATIC_AVATAR };
