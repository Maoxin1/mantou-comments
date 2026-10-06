'use strict';
// Synthetic, capability-limited core regressions only. These do not establish a
// deployed administrator route, a durable PostgreSQL write, or a real login.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { MemoryModel } = require('./memory-model.cjs');

// Resolve the actual bundled core from the installed, pinned server package.
// The deliberately disabled @waline/vercel entry point is never bootstrapped.
const serverPackage = require.resolve('@waline/vercel/package.json');
const serverRequire = createRequire(serverPackage);
const corePath = serverRequire.resolve('@waline/core');
const { createWalineCore, WalineError } = serverRequire('@waline/core');
const { allowedRequest } = require('../src/policy.cjs');
const nodemailer = require('nodemailer');
const originalFetch = global.fetch;
const originalCreateTransport = nodemailer.createTransport;
let fetchAttempts = 0;
let mailAttempts = 0;

before(() => {
  global.fetch = async () => { fetchAttempts++; throw new Error('SYNTHETIC_FETCH_FORBIDDEN'); };
  nodemailer.createTransport = () => { mailAttempts++; throw new Error('SYNTHETIC_MAIL_FORBIDDEN'); };
});
after(() => {
  global.fetch = originalFetch;
  nodemailer.createTransport = originalCreateTransport;
  assert.equal(fetchAttempts, 0, 'The tested capability-limited flows attempted fetch');
  assert.equal(mailAttempts, 0, 'The tested capability-limited flows attempted mail');
});

const POST = '/posts/private-moderation-fixture';
const admin = Object.freeze({ objectId: 'synthetic-admin', type: 'administrator' });
const reader = Object.freeze({ objectId: 'synthetic-reader', type: 'guest' });
const context = userInfo => ({ state: { userInfo, oauthServices: [] }, headers: {} });
const anonymous = () => context();
const denied = status => error => error instanceof WalineError && error.status === status;

function fixture() {
  const models = {
    Comment: new MemoryModel(),
    Users: new MemoryModel([admin, reader]),
    Counter: new MemoryModel(),
  };
  // No notification, OAuth, webhook, spam, CAPTCHA, network avatar, token or
  // password capability is supplied. A clock is the only injected service.
  const services = Object.freeze({ clock: { now: () => new Date('2026-10-06T00:00:00Z') } });
  const core = createWalineCore({
    models,
    config: { audit: true, forceLogin: false, disableRegion: true, disableUserAgent: true },
    services,
  });
  return { core, models, services };
}

async function pendingPair(core) {
  const root = await core.comment.create({
    nick: 'Synthetic anonymous reader', comment: 'Pending root fixture', url: POST,
    status: 'approved', user_id: admin.objectId, type: 'administrator',
  }, anonymous());
  const reply = await core.comment.create({
    nick: 'Synthetic anonymous replier', mail: '', comment: 'Pending reply fixture', url: POST,
    pid: root.objectId, rid: root.objectId, status: 'approved', user_id: admin.objectId,
  }, anonymous());
  return { root, reply };
}

test('private moderation: uses the real core bundled in the pinned installed server', () => {
  const installed = require(serverPackage);
  assert.equal(installed.name, '@mantou/waline-postgresql');
  assert.equal(installed.version, '1.43.4-mantou.1');
  assert.equal(serverRequire('@waline/core/package.json').version, '0.1.0');
  assert.equal(corePath, path.join(path.dirname(serverPackage), 'node_modules/@waline/core/dist/index.cjs'));
});

test('private moderation: anonymous root and reply need no email and remain waiting despite forged privileges', async () => {
  const { core, models } = fixture();
  const { root, reply } = await pendingPair(core);
  assert.equal(root.status, 'waiting');
  assert.equal(reply.status, 'waiting');
  assert.equal(models.Comment.rows.length, 2);
  assert.equal(models.Comment.rows[0].mail, undefined);
  assert.equal(models.Comment.rows[1].mail, '');
  assert.deepEqual(models.Comment.rows.map(row => row.status), ['waiting', 'waiting']);
  assert.ok(models.Comment.rows.every(row => row.user_id === undefined));
  assert.ok(models.Comment.rows.every(row => row.type === undefined));
  const visible = await core.comment.list({ path: POST }, anonymous());
  assert.equal(visible.count, 0);
  assert.deepEqual(visible.data, []);
  assert.deepEqual(await core.comment.count({ url: POST }, anonymous()), [0]);
});

test('private moderation: anonymous callers and non-admin users cannot approve another reader’s root or reply', async () => {
  const { core, models } = fixture();
  const { root, reply } = await pendingPair(core);
  const beforeRows = structuredClone(models.Comment.rows);
  for (const comment of [root, reply]) {
    const input = { objectId: comment.objectId, data: { status: 'approved' } };
    await assert.rejects(core.comment.update(input, anonymous()), denied(401));
    await assert.rejects(core.comment.update(input, context(reader)), denied(403));
  }
  assert.deepEqual(models.Comment.rows, beforeRows);
  await assert.rejects(core.comment.listForAdmin({}, anonymous()), denied(401));
  await assert.rejects(core.comment.listForAdmin({}, context(reader)), denied(403));

  const own = await core.comment.create({ comment: 'Synthetic reader-owned pending comment', url: POST }, context(reader));
  await core.comment.update({ objectId: own.objectId, data: { comment: 'Synthetic own edit', status: 'approved', user_id: admin.objectId } }, context(reader));
  const saved = models.Comment.rows.find(row => row.objectId === own.objectId);
  assert.equal(saved.status, 'waiting', 'An owner may edit text but must not self-approve');
  assert.equal(saved.user_id, reader.objectId);
  assert.deepEqual(await core.comment.count({ url: POST }, anonymous()), [0]);
});

test('private moderation: approving one root then one reply reveals only those intended rows', async () => {
  const { core, models } = fixture();
  const { root, reply } = await pendingPair(core);
  const sibling = await core.comment.create({ comment: 'Still-hidden sibling reply', url: POST, pid: root.objectId, rid: root.objectId }, anonymous());
  const other = await core.comment.create({ comment: 'Still-hidden other root', url: POST }, anonymous());
  const elsewhere = await core.comment.create({ comment: 'Still-hidden other page', url: '/posts/another-fixture' }, anonymous());

  // The administrator identity is trusted synthetic server context here. Actual
  // authentication/bootstrap remains a separate, server-only adapter concern.
  const queue = await core.comment.listForAdmin({ status: 'waiting' }, context(admin));
  assert.equal(queue.waitingCount, 5);
  assert.deepEqual(new Set(queue.data.map(row => row.objectId)), new Set([root, reply, sibling, other, elsewhere].map(row => row.objectId)));

  await core.comment.update({ objectId: root.objectId, data: { status: 'approved' } }, context(admin));
  let visible = await core.comment.list({ path: POST }, anonymous());
  assert.equal(visible.count, 1);
  assert.deepEqual(visible.data.map(row => row.objectId), [root.objectId]);
  assert.deepEqual(visible.data[0].children, []);
  assert.equal(models.Comment.rows.find(row => row.objectId === reply.objectId).status, 'waiting');
  assert.deepEqual(await core.comment.count({ url: POST }, anonymous()), [1]);

  await core.comment.update({ objectId: reply.objectId, data: { status: 'approved' } }, context(admin));
  visible = await core.comment.list({ path: POST }, anonymous());
  assert.equal(visible.count, 2);
  assert.deepEqual(visible.data.map(row => row.objectId), [root.objectId]);
  assert.deepEqual(visible.data[0].children.map(row => row.objectId), [reply.objectId]);
  assert.deepEqual(await core.comment.count({ url: POST }, anonymous()), [2]);
  for (const hidden of [sibling, other, elsewhere]) {
    assert.equal(models.Comment.rows.find(row => row.objectId === hidden.objectId).status, 'waiting');
    assert.ok(!JSON.stringify(visible).includes(hidden.comment));
  }
  assert.deepEqual((await core.comment.list({ path: '/posts/another-fixture' }, anonymous())).data, []);
  assert.deepEqual(new Set(models.Comment.rows.filter(row => row.status === 'approved').map(row => row.objectId)), new Set([root.objectId, reply.objectId]));
});

test('private moderation: no notification capability or public registration/OAuth route is enabled by the fixture', async () => {
  const { core, models, services } = fixture();
  assert.deepEqual(Object.keys(services), ['clock']);
  const { root, reply } = await pendingPair(core);
  await core.comment.update({ objectId: root.objectId, data: { status: 'approved' } }, context(admin));
  await core.comment.update({ objectId: reply.objectId, data: { status: 'approved' } }, context(admin));
  assert.equal(fetchAttempts, 0);
  assert.equal(mailAttempts, 0);
  assert.deepEqual(models.Users.rows, [admin, reader]);
  for (const method of ['GET', 'POST', 'PUT']) {
    for (const url of ['/api/user', '/user', '/api/%75ser', '/api/oauth', '/api/oauth/github', '/api/token']) {
      assert.equal(allowedRequest({ method, url, headers: {} }), false, `${method} ${url}`);
    }
  }
});
