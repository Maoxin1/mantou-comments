'use strict';
// Private preparation only, 2026-10-06. AGPL-3.0-or-later.
// No route, environment access, connection factory, signup or session issuance.
// The trusted caller must establish owner authorization (not a request flag),
// bind the approved email, and supply a fresh, idle, exclusively owned, bounded,
// hostname/certificate-verified direct PG lease (never an existing transaction).
// dispose() must destroy the connection rather than return it for reuse.
// The caller must also verify the pinned schema and full visibility of users
// (including RLS policy state); an empty restricted view is not an empty table.
// This helper has deliberately NOT been wired to a real database or HTTP server.
const { PasswordHash } = require('phpass');
const FIELDS = ['email', 'displayName', 'password', 'confirmPassword'];
const INSERT = "INSERT INTO public.wl_users (email, display_name, password, type) VALUES ($1, $2, $3, 'administrator') RETURNING id";

function validEmail(value) {
  return typeof value === 'string' && value.length <= 255 &&
    /^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+\.[^\s@\u0000-\u001f\u007f]+$/.test(value);
}
function checkedInput(input, expectedEmail) {
  if (!input || typeof input !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return null;
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== FIELDS.length ||
      FIELDS.some(key => !Object.hasOwn(descriptors, key) || !Object.hasOwn(descriptors[key], 'value'))) return null;
  const value = Object.fromEntries(FIELDS.map(key => [key, descriptors[key].value]));
  if (!validEmail(expectedEmail) || value.email !== expectedEmail ||
      typeof value.displayName !== 'string' || !value.displayName.trim() ||
      [...value.displayName].length > 255 || /[\u0000-\u001f\u007f]/.test(value.displayName) ||
      typeof value.password !== 'string' || [...value.password].length < 12 ||
      Buffer.byteLength(value.password, 'utf8') > 72 || value.password.includes('\0') ||
      value.password !== value.confirmPassword) return null;
  return value;
}
function verifiedTls(client) {
  const stream = client?.connection?.stream;
  return stream?.encrypted === true && stream.authorized === true &&
    typeof stream.getProtocol === 'function' && ['TLSv1.2', 'TLSv1.3'].includes(stream.getProtocol());
}

function createPrivateAdministratorBootstrap({ authorize, expectedEmail, acquire } = {}) {
  return async function privateBootstrap({ readInput } = {}) {
    try {
      if (typeof authorize !== 'function' || await authorize() !== true) return { status: 'denied' };
    } catch { return { status: 'denied' }; }

    let input;
    try {
      input = typeof readInput === 'function' ? checkedInput(await readInput(), expectedEmail) : null;
    } catch { input = null; }
    if (!input) return { status: 'invalid_input' };

    let lease, result, stage = 'password_hash', transactionAttempted = false, commitAttempted = false;
    let hash;
    try {
      // Exactly the pinned upstream's installed default: bcrypt, cost 10.
      hash = await new PasswordHash().hashPasswordAsync(input.password);
      input.password = input.confirmPassword = undefined;
      stage = 'connect';
      if (typeof acquire !== 'function') throw new Error('Unavailable lease');
      lease = await acquire();
      if (!lease || typeof lease.dispose !== 'function' || typeof lease.client?.query !== 'function') throw new Error('Invalid lease');
      stage = 'tls';
      if (!verifiedTls(lease.client)) throw new Error('Unverified transport');
      stage = 'begin';
      transactionAttempted = true;
      await lease.client.query('BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE');
      stage = 'transaction_mode';
      const mode = await lease.client.query('SHOW transaction_read_only');
      if (mode?.rows?.length !== 1 || mode.rows[0].transaction_read_only !== 'off') throw new Error('Unexpected mode');
      stage = 'lock';
      await lease.client.query('LOCK TABLE public.wl_users IN EXCLUSIVE MODE');
      stage = 'empty_check';
      const existing = await lease.client.query('SELECT id FROM public.wl_users LIMIT 1');
      if (!Array.isArray(existing?.rows)) throw new Error('Invalid empty check');
      if (existing.rows.length !== 0) {
        stage = 'rollback';
        await lease.client.query('ROLLBACK');
        transactionAttempted = false;
        result = { status: 'blocked_nonempty' };
      } else {
        stage = 'insert';
        const inserted = await lease.client.query(INSERT, [input.email, input.displayName, hash]);
        const id = inserted?.rows?.[0]?.id;
        if (inserted?.rows?.length !== 1 || !Number.isInteger(id) || id < 1 || id > 2147483647) throw new Error('Invalid insert result');
        stage = 'commit';
        commitAttempted = true;
        await lease.client.query('COMMIT');
        transactionAttempted = false;
        result = { status: 'created', administratorId: id };
      }
    } catch {
      if (commitAttempted) {
        // The server might have committed even when its reply was lost. Never
        // retry, assert absence, or issue a misleading rollback after this point.
        result = { status: 'outcome_unknown', stage: 'commit' };
      } else {
        result = { status: 'failed', stage };
        if (transactionAttempted && typeof lease?.client?.query === 'function') {
          try { await lease.client.query('ROLLBACK'); result.rollback = 'confirmed'; }
          catch { result.rollback = 'unconfirmed'; }
        }
      }
    } finally {
      // Reference release only: immutable JavaScript strings are not guaranteed
      // erased from memory. The caller must never log or persist password input.
      input = undefined;
      hash = undefined;
      if (lease) {
        try {
          if (typeof lease.dispose !== 'function') throw new Error('Missing disposal');
          await lease.dispose();
          result.cleanup = 'confirmed';
        } catch { result.cleanup = 'unconfirmed'; }
      }
    }
    return result;
  };
}
module.exports = { createPrivateAdministratorBootstrap };
