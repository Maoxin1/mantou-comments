'use strict';
// Synthetic-only subprocess. No real credentials, DNS, sockets or database.
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const scenario = process.argv[2];
const network = [], logs = [];
let connects = 0, closes = 0, releases = 0;
for (const [label, object, key] of [
  ['net', require('node:net').Socket.prototype, 'connect'],
  ['tls', require('node:tls'), 'connect'],
  ['dns', require('node:dns'), 'lookup'],
]) object[key] = () => { network.push(label); throw new Error('Synthetic network access forbidden'); };
for (const key of ['log', 'warn', 'error', 'info', 'debug', 'trace']) {
  console[key] = (...args) => logs.push(args.map(String).join(' '));
}

const secretError = code => Object.assign(new Error('SYNTHETIC_SECRET synthetic-private PRIVATE_SQL'), code ? { code } : {});
const environment = {
  POSTGRES_HOST: 'ep-synthetic-private.ap-southeast-1.aws.neon.tech',
  POSTGRES_USER: 'synthetic-private', POSTGRES_PASSWORD: 'SYNTHETIC_SECRET', POSTGRES_DATABASE: 'synthetic-private',
};
const codes = {
  dns: 'ENOTFOUND', dns_again: 'EAI_AGAIN', tcp: 'ECONNREFUSED', tcp_reset: 'ECONNRESET',
  certificate: 'ERR_TLS_CERT_ALTNAME_INVALID', authentication: '28P01', database: '3D000',
  protocol: '08P01', protocol_transport: 'EPROTO', startup: '0A000', limit: '53300', internal: 'XX000',
  coded_timeout: 'ETIMEDOUT', unknown: 'SYNTHETIC_SECRET',
};
const timeoutMessages = {
  client_timeout: 'timeout expired', pool_timeout: 'Connection terminated due to connection timeout',
  queue_timeout: 'timeout exceeded when trying to connect',
};
const nativeSetTimeout = global.setTimeout;
global.setTimeout = (callback, delay, ...args) => nativeSetTimeout(callback,
  scenario === 'actual_pool_timeout' && delay === 5000 ? 15 :
    scenario === 'actual_pool_timeout' && delay === 5500 ? 1000 :
      scenario === 'deadline' && delay === 5500 ? 15 : delay, ...args);

class FakePool extends EventEmitter {
  constructor() { super(); if (scenario === 'pool_creation') throw secretError(); }
  async connect() {
    connects++;
    if (Object.hasOwn(codes, scenario)) throw secretError(codes[scenario]);
    if (Object.hasOwn(timeoutMessages, scenario)) throw new Error(timeoutMessages[scenario]);
    if (scenario === 'timeout_substring') throw new Error('SYNTHETIC_SECRET timeout expired synthetic-private');
    if (scenario === 'query_timeout_wrong_phase') throw new Error('Query read timeout');
    if (scenario === 'generic_connection_terminated') throw new Error('Connection terminated');
    if (scenario.startsWith('startup_field:') || scenario.startsWith('startup_option:')) {
      const [kind, field] = scenario.split(':');
      throw Object.assign(new Error(`unsupported startup parameter${kind === 'startup_option' ? ' in options' : ''}: ${field}`), { code: '08P01' });
    }
    if (scenario === 'startup_unknown_field') throw Object.assign(new Error('unsupported startup parameter: SYNTHETIC_SECRET'), { code: 'XX000' });
    if (scenario === 'startup_value_suffix') throw Object.assign(new Error('unsupported startup parameter: options=SYNTHETIC_SECRET'), { code: 'XX000' });
    if (scenario === 'startup_message_prefix') throw Object.assign(new Error('SYNTHETIC_SECRET unsupported startup parameter: options'), { code: 'XX000' });
    if (scenario === 'startup_trailing_newline') throw Object.assign(new Error('unsupported startup parameter: options\n'), { code: 'XX000' });
    if (scenario === 'startup_trailing_line_separator') throw Object.assign(new Error('unsupported startup parameter in options: search_path\u2028'), { code: 'XX000' });
    if (scenario === 'hostile_error') {
      const error = secretError();
      Object.defineProperty(error, 'code', { get() { throw secretError(); } });
      throw error;
    }
    if (scenario === 'deadline') return new Promise(() => {});
    const client = new EventEmitter();
    client.connection = { stream: { encrypted: true, authorized: scenario !== 'tls_check', getProtocol: () => 'TLSv1.3' } };
    client.release = destroy => { releases++; if (destroy !== true) throw new Error('Synthetic client must be destroyed'); };
    client.query = (sql, callback) => {
      if (sql === 'SHOW transaction_read_only' && scenario === 'read_only_driver_timeout') return callback(new Error('Query read timeout'));
      if (sql === 'SHOW transaction_read_only' && scenario === 'startup_wrong_phase') return callback(Object.assign(new Error('unsupported startup parameter: options'), { code: 'XX000' }));
      if (sql === 'SHOW transaction_read_only') return callback(null, { rows: [{ transaction_read_only: scenario === 'read_only_check' ? 'off' : 'on' }] });
      if (sql.includes('pg_catalog.pg_class')) {
        if (scenario === 'catalog_driver_timeout') return callback(new Error('Query read timeout'));
        if (scenario === 'catalog_query') return callback(secretError());
        return callback(null, { rows: ['wl_comment', 'wl_counter', 'wl_users'].map(table_name => ({ table_name, present: true, readable: true })) });
      }
      return callback(null, { rows: [] });
    };
    return client;
  }
  async end() { closes++; if (scenario === 'cleanup') throw secretError(); }
}

const pg = require('pg');
pg.Pool = FakePool;
if (scenario === 'actual_pool_timeout') {
  const ActualPool = require('pg-pool');
  class FakeClient extends EventEmitter {
    constructor() { super(); this.connection = { stream: { destroy: () => this.callback(secretError()) } }; }
    connect(callback) { connects++; this.callback = callback; }
    end(callback) { if (callback) callback(); }
  }
  pg.Pool = class extends ActualPool {
    constructor(options) { super({ ...options, Client: FakeClient }); }
    end(...args) { closes++; return super.end(...args); }
  };
}
if (scenario === 'driver_load') {
  const load = Module._load;
  Module._load = function (request, ...args) {
    if (request === 'think-model-postgresql/lib/socket') throw secretError('MODULE_NOT_FOUND');
    return load.call(this, request, ...args);
  };
}
if (scenario === 'configuration') delete environment.POSTGRES_HOST;

require('../src/postgresql-diagnostic.cjs').runPostgresqlDiagnostic(environment).then(result => {
  process.stdout.write(JSON.stringify({ result, connects, closes, releases, network, logs,
    importedWaline: Object.keys(require.cache).some(file => file.includes('/@waline/') || file.includes('/thinkjs/')) }));
}).catch(() => { process.stderr.write('Synthetic failure-phase probe failed'); process.exitCode = 1; });
