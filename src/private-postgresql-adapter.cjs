'use strict';
// Private preparation only, 2026-10-06. AGPL-3.0-or-later.
// No import-time environment reads, driver load, connection or HTTP route.
// The caller supplies trusted server configuration and authorizes access.
// Bootstrap verifies its exact public target; complete model/schema acceptance
// and durable real-service verification remain prerequisites for live use.
// These capabilities are not a public registration or arbitrary-SQL endpoint.
const { createPostgresqlOptions } = require('./postgresql-diagnostic.cjs');
const noop = () => {};
const unavailable = () => new Error('Private PostgreSQL operation unavailable');
const BEGIN = 'BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE';
const TABLES = Object.freeze({ Comment: 'comment', Users: 'users', Counter: 'counter' });
const DATES = Object.freeze(['insertedAt', 'createdAt', 'updatedAt']);
const utcDatetime = date => new Date(date).toISOString().slice(0, 19).replace('T', ' ');
const PREFLIGHT_FIELDS = Object.freeze(['database_ok', 'role_ok', 'read_only_ok', 'table_ok', 'columns_ok', 'primary_key_ok', 'sequence_ok', 'privileges_ok']);
// Exact approved target and pinned upstream user/sequence definition. This
// SELECT is read-only autocommit, never BEGIN, nextval(), DDL or a user-row read.
const BOOTSTRAP_PREFLIGHT = `WITH bootstrap_target AS (
  SELECT c.* FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='wl_users'
), sequence_target AS (
  SELECT c.* FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='wl_users_seq'
)
SELECT current_database()='neondb' AS database_ok, current_user='neondb_owner' AS role_ok,
  pg_catalog.current_setting('transaction_read_only')='on' AS read_only_ok,
  t.relkind='r' AND t.relowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)
    AND NOT t.relrowsecurity AND NOT t.relforcerowsecurity
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=t.oid AND NOT tgisinternal)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_rewrite WHERE ev_class=t.oid) AS table_ok,
  (SELECT count(*)=5 AND bool_and(COALESCE(a.attnotnull AND a.attgenerated='' AND a.attidentity='' AND
    CASE WHEN a.attname='id' THEN a.atttypid='pg_catalog.int4'::pg_catalog.regtype
      AND pg_catalog.pg_get_expr(d.adbin,d.adrelid)=pg_catalog.format('nextval(%L::regclass)',s.oid::pg_catalog.regclass::text)
    ELSE a.atttypid='pg_catalog.varchar'::pg_catalog.regtype
      AND a.atttypmod=CASE WHEN a.attname='type' THEN 54 ELSE 259 END
      AND pg_catalog.pg_get_expr(d.adbin,d.adrelid)='''''::character varying' END,false))
   FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped
     AND a.attname IN ('id','email','display_name','password','type')) AS columns_ok,
  EXISTS (SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attname='id'
    WHERE i.indrelid=t.oid AND i.indisprimary AND i.indisvalid AND i.indnatts=1 AND i.indkey[0]=a.attnum) AS primary_key_ok,
  s.relkind='S' AND s.relowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user) AS sequence_ok,
  pg_catalog.has_schema_privilege(t.relnamespace,'USAGE')
    AND pg_catalog.has_table_privilege(t.oid,'SELECT') AND pg_catalog.has_table_privilege(t.oid,'INSERT')
    AND pg_catalog.has_sequence_privilege(s.oid,'USAGE') AND pg_catalog.has_sequence_privilege(s.oid,'SELECT') AS privileges_ok
FROM bootstrap_target t CROSS JOIN sequence_target s`;

async function bounded(operation, milliseconds, expired = noop) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => { timer = setTimeout(() => { expired(); reject(unavailable()); }, milliseconds); }),
    ]);
  } finally { clearTimeout(timer); }
}

function normalizeRow(row, preferSqlDates = false) {
  const copy = { ...row };
  if (Object.hasOwn(copy, 'id')) { copy.objectId = copy.id; delete copy.id; }
  for (const key of DATES) {
    if ((preferSqlDates || copy[key] === undefined) && Object.hasOwn(copy, key.toLowerCase())) copy[key] = copy[key.toLowerCase()];
    delete copy[key.toLowerCase()];
  }
  return copy;
}

function installed() {
  const { createRequire } = require('node:module');
  const manifest = require.resolve('@waline/vercel/package.json');
  const serverRequire = createRequire(manifest);
  const packageInfo = serverRequire(manifest);
  if (packageInfo.name !== '@mantou/waline-postgresql' || packageInfo.version !== '1.43.4-mantou.1' || packageInfo.upstreamVersion !== '1.43.4') throw unavailable();
  return { serverRequire, root: require('node:path').dirname(manifest) };
}

function createPrivatePostgresqlAdapter({ environment } = {}) {
  let closed = false, models;
  const leases = new Set();

  async function acquire(bootstrap) {
    if (closed || typeof environment !== 'function') throw unavailable();
    let raw, disposed = false, faulted = false, disposing;
    function destroy() { try { raw?.connection?.stream?.destroy(); } catch {} }
    async function dispose() {
      if (disposing) return disposing;
      disposed = true;
      // This is a dedicated Client, never a pool checkout: destroy rather than
      // reuse, including any open/failed transaction and a timed-out query.
      disposing = Promise.resolve().then(() => {
        destroy();
        return bounded(() => raw?.end(), 2000);
      }).catch(() => { throw unavailable(); }).finally(() => leases.delete(dispose));
      return disposing;
    }
    try {
      const values = await bounded(environment, 1000);
      if (closed) throw unavailable();
      const options = createPostgresqlOptions(values);
      options.application_name = 'mantou-private-preparation';
      options.options = '-c default_transaction_read_only=on -c search_path=pg_catalog,public -c timezone=UTC';
      // Bind both SNI and certificate hostname checks to the validated direct
      // endpoint. No request value, PGSSLMODE or connection URL can weaken TLS.
      const { checkServerIdentity } = require('node:tls');
      options.ssl = { ...options.ssl, servername: options.host, checkServerIdentity: (_host, cert) => checkServerIdentity(options.host, cert) };
      const { serverRequire } = installed();
      const pg = serverRequire('pg');
      const parseTimestamp = pg.types.getTypeParser(1184, 'text');
      const parseUtcTimestamp = value => parseTimestamp(/^-?infinity$/.test(value) ? value : value.replace(/( BC)?$/, '+00$1'));
      // Timestamp(0) without time zone is the pinned schema's UTC convention.
      // pg's default parser uses the host timezone; never mutate global types.
      options.types = Object.freeze({ getTypeParser: (oid, format = 'text') => oid === 1114 && format === 'text' ? parseUtcTimestamp : pg.types.getTypeParser(oid, format) });
      raw = new pg.Client(options);
      leases.add(dispose);
      raw.on('error', () => { faulted = true; void dispose().catch(noop); });
      await bounded(() => raw.connect(), 5500, () => { faulted = true; destroy(); });
      const stream = raw.connection?.stream;
      const protocol = stream?.getProtocol?.();
      if (closed || disposed || faulted || stream?.encrypted !== true || stream.authorized !== true ||
          !['TLSv1.2', 'TLSv1.3'].includes(protocol) || raw.getTransactionStatus?.() !== 'I' || raw.readyForQuery !== true) throw unavailable();
      // An immutable transport view is enough for the bootstrap's independent
      // TLS gate. Do not expose credentials, the driver, release(), or sockets.
      const connection = Object.freeze({ stream: Object.freeze({ encrypted: true, authorized: true, getProtocol: () => protocol }) });
      let querying = false;
      const client = Object.freeze({ connection, async query(sql, values) {
        if (closed || disposed || faulted || querying || typeof sql !== 'string') throw unavailable();
        querying = true;
        try {
          const result = await bounded(() => raw.query(sql, values), 3500, () => { faulted = true; destroy(); });
          if (disposed || faulted) throw unavailable();
          return result;
        } catch { throw unavailable(); }
        finally { querying = false; }
      } });
      if (bootstrap) {
        const result = await client.query(BOOTSTRAP_PREFLIGHT);
        if (result?.rows?.length !== 1 || PREFLIGHT_FIELDS.some(key => result.rows[0][key] !== true) ||
            raw.getTransactionStatus() !== 'I' || raw.readyForQuery !== true) throw unavailable();
      }
      return Object.freeze({ client, dispose });
    } catch {
      try { await dispose(); } catch {}
      throw unavailable();
    }
  }
  const acquireBootstrap = () => acquire(true);

  async function modelQuery(sqlOptions) {
    let lease, begun = false, commitAttempted = false;
    try {
      lease = await acquire(false);
      begun = true;
      await lease.client.query(BEGIN);
      const sql = typeof sqlOptions === 'string' ? sqlOptions : sqlOptions.sql;
      const result = await lease.client.query(sql);
      commitAttempted = true;
      await lease.client.query('COMMIT');
      return result;
    } catch {
      // Never automatically replay writes or roll back after an uncertain
      // COMMIT. The private HTTP caller must treat failures as unknown results.
      if (begun && !commitAttempted) { try { await lease.client.query('ROLLBACK'); } catch {} }
      throw unavailable();
    } finally { if (lease) await lease.dispose(); }
  }

  function getModels() {
    if (closed) throw unavailable();
    if (models) return models;
    try {
      const { serverRequire, root } = installed();
      const { readFileSync } = require('node:fs');
      const { join } = require('node:path');
      const { compileFunction } = require('node:vm');
      const helper = serverRequire('think-helper');
      const Model = serverRequire('think-model/lib/model');
      const PostgreSQL = serverRequire('think-model-postgresql');
      const transport = Object.freeze({ query: modelQuery, execute: modelQuery });
      class Query extends PostgreSQL.Query { socket() { return transport; } }
      // Upstream caches metadata by bare table name in module scope. Evaluate
      // its unchanged schema module once per adapter, keeping cache ownership
      // local; qualify only its two fixed metadata SELECTs to public.
      const schemaFile = serverRequire.resolve('think-model-postgresql/lib/schema');
      const schemaModule = { exports: {} };
      compileFunction(readFileSync(schemaFile, 'utf8'), ['require', 'module', 'exports'], { filename: schemaFile })(
        require('node:module').createRequire(schemaFile), schemaModule, schemaModule.exports,
      );
      class Schema extends schemaModule.exports {
        set query(value) {
          this.metadataQuery = Object.freeze({ query(sql) {
            if (/^SELECT column_name,is_nullable,data_type FROM INFORMATION_SCHEMA\.COLUMNS WHERE table_name='wl_(comment|users|counter)'$/.test(sql)) return value.query(`${sql} AND table_schema='public'`);
            if (/^SELECT indexname,indexdef FROM pg_indexes WHERE tablename='wl_(comment|users|counter)'$/.test(sql)) return value.query(`${sql} AND schemaname='public'`);
            throw unavailable();
          } });
        }
        get query() { return this.metadataQuery; }
        parseData(data, ...args) {
          const normalized = { ...data };
          for (const key of DATES) if (normalized[key] !== undefined) {
            normalized[key.toLowerCase()] ??= normalized[key] instanceof Date ? utcDatetime(normalized[key]) : normalized[key];
            delete normalized[key];
          }
          return super.parseData(normalized, ...args);
        }
      }
      class Adapter extends PostgreSQL {}
      Adapter.Query = Query;
      Adapter.Schema = Schema;
      const config = Object.freeze({ handle: Adapter, prefix: 'wl_', logSql: false, logConnect: false, logger: noop, debounce: false });
      // Only these four exact, installed upstream files are evaluated. Lexical
      // think injection avoids a ThinkJS bootstrap or shared-global mutation.
      // No source replacement, copied CRUD implementation or custom SQL builder.
      const cache = new Map();
      const think = Object.freeze({
        Service: class { model(name) { if (!Object.values(TABLES).includes(name)) throw unavailable(); return new Model(name, config); } },
        isEmpty: helper.isEmpty, isDate: helper.isDate, datetime: utcDatetime,
      });
      const quietConsole = Object.freeze(Object.fromEntries(['log', 'error', 'warn', 'info', 'debug', 'trace'].map(key => [key, noop])));
      function load(name) {
        if (!['base', 'order', 'mysql', 'postgresql'].includes(name)) throw unavailable();
        if (cache.has(name)) return cache.get(name).exports;
        const filename = join(root, 'src/service/storage', `${name}.js`);
        const module = { exports: {} }; cache.set(name, module);
        const localRequire = request => {
          const match = /^\.\/(base|order|mysql|postgresql)\.js$/.exec(request);
          if (!match) throw unavailable();
          return load(match[1]);
        };
        compileFunction(readFileSync(filename, 'utf8'), ['require', 'module', 'exports', 'think', 'console'], { filename })(localRequire, module, module.exports, think, quietConsole);
        return module.exports;
      }
      const Storage = load('postgresql');
      models = Object.freeze(Object.fromEntries(Object.keys(TABLES).map(name => {
        const storage = new Storage(name);
        const facade = Object.fromEntries(['select', 'add', 'update', 'delete', 'count'].map(method => [method, async (...args) => {
          if (closed) throw unavailable();
          try {
            // Upstream mutates filters, fields and add inputs. Keep that detail
            // inside the adapter and normalize its inherited update row shape.
            const copied = args.map(value => typeof value === 'function' ? value : structuredClone(value));
            if (method === 'select' && Array.isArray(copied[1]?.field)) copied[1].field = copied[1].field.map(field => field === 'objectId' ? 'id' : field);
            const result = await storage[method](...copied);
            return ['select', 'update'].includes(method) ? result.map(row => normalizeRow(row)) : method === 'add' ? normalizeRow(result, true) : result;
          } catch { throw unavailable(); }
        }]));
        if (name === 'Comment') facade.transitionStatus = async input => {
          try {
            if (closed || !input || typeof input !== 'object' || Array.isArray(input) ||
                Object.keys(input).length !== 4 || !['objectId', 'from', 'to', 'url'].every(key => Object.hasOwn(input, key))) throw unavailable();
            const { objectId, from, to, url } = input;
            // The pinned schema uses a positive int4 comment key. Match the
            // exact previously read URL as well as the source status so a
            // concurrent move cannot escape the caller's moderation scope.
            if (!['string', 'number'].includes(typeof objectId) || !/^[1-9]\d{0,9}$/.test(String(objectId)) || Number(objectId) > 2147483647 ||
                typeof url !== 'string' || !url.length || url.includes('\0') ||
                !((from === 'waiting' && (to === 'approved' || to === 'spam')) || (from === 'spam' && to === 'waiting'))) throw unavailable();
            const before = await facade.select({ objectId, status: from, url }, { limit: 1 });
            if (before.length === 0) return null;
            if (before.length !== 1) throw unavailable();
            if (String(before[0].objectId) !== String(objectId) || before[0].status !== from || before[0].url !== url) return null;
            // Do not use inherited storage.update: it SELECTs by the supplied
            // filter, then drops that filter and writes by id alone. The pinned
            // Think builder keeps all predicates in one UPDATE and returns its
            // affected-row count through the existing bounded transaction path.
            const changed = await storage.model(storage.tableName)
              .where({ id: objectId, status: from, url }).update({ status: to });
            if (changed === 0) return null;
            if (changed !== 1) throw unavailable();
            // This is the selected snapshot plus the committed transition, not
            // a post-write reread that could observe a later concurrent change.
            return { ...before[0], status: to };
          } catch { throw unavailable(); }
        };
        return [name, Object.freeze(facade)];
      })));
      return models;
    } catch { throw unavailable(); }
  }

  async function close() {
    closed = true;
    const results = await Promise.allSettled([...leases].map(dispose => dispose()));
    if (results.some(result => result.status === 'rejected')) throw unavailable();
  }
  return Object.freeze({ getModels, acquireBootstrap, close });
}

module.exports = { createPrivatePostgresqlAdapter };
