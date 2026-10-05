'use strict';
// Isolated adapter for the pinned upstream implementation. No package source is
// rewritten. This deliberately uses pinned ThinkJS loader APIs; upgrades require
// the bootstrap regression suite. Production index.cjs never imports this file.
const path = require('node:path');
const os = require('node:os');
const { projectPublicResponse } = require('./policy.cjs');
const SERVICES = Object.freeze(['avatar', 'core', 'notify']);
function createIsolatedApplication(config) {
  const root = path.dirname(require.resolve('@waline/vercel/package.json'));
  const upstream = require('@waline/vercel/package.json');
  if (upstream.version !== '1.43.4-mantou.1' || upstream.upstreamVersion !== '1.43.4' || upstream.name !== '@mantou/waline-postgresql') throw new Error('Unreviewed Waline derivative');
  const Application = require('thinkjs');
  const Loader = require('thinkjs/lib/loader');
  const Middleware = require('think-loader/loader/middleware');
  class IsolatedLoader extends Loader {
    writeConfig(resolved) {
      // Called by the upstream loader before services/middleware are loaded.
      // Do not persist any resolved config, JWT or database credentials.
      for (const adapter of Object.values(resolved.model || {})) {
        if (!adapter || typeof adapter !== 'object') continue;
        adapter.logSql = false;
        adapter.logConnect = false;
        adapter.logger = () => {};
      }
      resolved.model.postgresql.ssl = { rejectUnauthorized: true, minVersion: 'TLSv1.2' };
    }
    loadData() {
      // Replace only this loader instance's method, never a shared prototype.
      // No storage service is needed or permitted for the explicit memory model.
      const original = think.loader.loadService;
      think.loader.loadService = () => Object.fromEntries(SERVICES.map(name => {
        const filename = path.join(root, 'src/service', `${name}.js`);
        const service = require(filename);
        service.prototype.__filename = filename;
        return [name, service];
      }));
      try { super.loadData(); } finally { think.loader.loadService = original; }
    }
    loadMiddleware() {
      const parser = new Middleware();
      const definitions = require(path.join(root, 'src/config/middleware.js'))
        .filter(item => item?.handle !== 'trace')
        .map(item => typeof item === 'object' ? { ...item, options: item.options && { ...item.options } } : item);
      // Outside payload parsing and logic: upstream's debug trace would expose
      // stack/body details on those failures before the public plugin can run.
      think.app.use(async (ctx, next) => {
        ctx.set('cache-control', 'no-store');
        try { await next(); } catch (error) {
          if (!think.isPrevent(error)) {
            ctx.status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 500;
            ctx.body = { errno: ctx.status, errmsg: 'Comment result is unknown' };
          }
        } finally { ctx.body = projectPublicResponse(ctx.body); }
      });
      for (const middleware of parser.parse(definitions, parser.loadFiles(this.options.APP_PATH, false), think.app)) think.app.use(middleware);
    }
  }
  const app = new Application({ ROOT_PATH: root, APP_PATH: path.join(root, 'src'), VIEW_PATH: path.join(root, 'view'), RUNTIME_PATH: path.join(os.tmpdir(), 'runtime'), proxy: true, env: 'vercel' });
  new IsolatedLoader(app.options).loadAll('worker');
  for (const [key, value] of Object.entries(config)) think.config(key === 'model' ? 'customModel' : key, value);
  return async function isolatedApplication(req, res) {
    try {
      await think.beforeStartServer();
      await think.app.callback()(req, res);
      think.app.emit('appReady');
    } catch {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.setHeader('cache-control', 'no-store');
        res.end(JSON.stringify({ errno: 500, errmsg: 'Comment result is unknown' }));
      } else if (!res.writableEnded) res.end();
    }
  };
}
module.exports = { createIsolatedApplication, SERVICES };
