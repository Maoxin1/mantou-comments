// Modified 2026-10-05 for the local Mantou PostgreSQL-only derivative.
// Upstream notices are preserved in LICENSE and DERIVATION.md.
const { Console } = require('think-logger3');
const Postgresql = require('think-model-postgresql');
const { PG_USER, POSTGRES_USER, PG_PASSWORD, POSTGRES_PASSWORD, PG_DB,
  POSTGRES_DATABASE, PG_HOST, POSTGRES_HOST, PG_PORT, POSTGRES_PORT,
  PG_PREFIX, POSTGRES_PREFIX } = process.env;
const model = {
  type: 'postgresql',
  postgresql: {
    handle: Postgresql,
    user: PG_USER || POSTGRES_USER,
    password: PG_PASSWORD || POSTGRES_PASSWORD,
    database: PG_DB || POSTGRES_DATABASE,
    host: PG_HOST || POSTGRES_HOST || '127.0.0.1',
    port: PG_PORT || POSTGRES_PORT || '5432',
    connectionLimit: 1,
    prefix: PG_PREFIX || POSTGRES_PREFIX || 'wl_',
    ssl: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    logSql: false,
    logConnect: false,
    logger: () => {},
  },
};
const logger = { type: 'console', console: { handle: Console } };
module.exports = { logger, model };
