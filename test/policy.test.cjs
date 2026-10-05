'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { projectPublicResponse, allowedRequest, assertIsolatedEnvironment, STATIC_AVATAR } = require('../src/policy.cjs');
const privateMarker = 'PRIVATE_SENTINEL';
test('TM-015 / INV-001: nested reply projection keeps only declared scalar fields', () => {
  const result = projectPublicResponse({ errno: 0, data: { page: 1, count: 2, mail: privateMarker, data: [{ objectId: 'a', comment: 'Visible', ua: privateMarker, children: [{ objectId: 'b', comment: 'Reply', mail: privateMarker, reply_user: { nick: 'Parent', email: privateMarker, avatar: `https://example.invalid/${privateMarker}` } }] }] } });
  assert.equal(result.data.data[0].children[0].reply_user.nick, 'Parent');
  assert.equal(result.data.data[0].children[0].reply_user.avatar, STATIC_AVATAR);
  assert.ok(!JSON.stringify(result).includes(privateMarker));
});
test('TM-015: generated extension-field and nested-shape corpus cannot carry private fields through the public projection', () => {
  for (let seed = 0; seed < 100; seed++) {
    const source = { objectId: String(seed), comment: 'Visible', nick: { token: privateMarker }, ua: privateMarker, [`futureField${seed}`]: { value: privateMarker }, children: [{ objectId: 'child', comment: 'Reply', reply_user: { nick: 'Parent', token: privateMarker } }] };
    const result = projectPublicResponse({ errno: 0, data: source });
    assert.equal(result.data.objectId, String(seed));
    assert.ok(!JSON.stringify(result).includes(privateMarker));
    assert.equal(result.data.nick, undefined);
  }
});
test('TM-015: error payload, stack and non-JSON body are never copied to a public error', () => {
  for (const body of [{ errno: 500, errmsg: privateMarker, stack: privateMarker, data: { password: privateMarker } }, { error: privateMarker }, `not-json ${privateMarker}`]) {
    const result = projectPublicResponse(body);
    assert.notEqual(result.errno, 0); assert.ok(!JSON.stringify(result).includes(privateMarker));
  }
});
test('TM-035 postponed / AC-023 no-mail branch: SMTP and notification configs fail closed without logging values', () => {
  for (const key of ['SMTP_HOST', 'SMTP_SERVICE', 'SMTP_USER', 'SMTP_PASS', 'WEBHOOK', 'SC_KEY', 'QYWX_AM', 'QMSG_KEY', 'TG_BOT_TOKEN', 'PUSH_PLUS_KEY', 'DISCORD_WEBHOOK', 'LARK_WEBHOOK', 'TURNSTILE_SECRET', 'RECAPTCHA_V3_SECRET']) {
    assert.throws(() => assertIsolatedEnvironment({ AKISMET_KEY: 'false', [key]: privateMarker }), (error) => error.message.includes(key) && !error.message.includes(privateMarker));
  }
  assert.doesNotThrow(() => assertIsolatedEnvironment({ AKISMET_KEY: 'false', LOGIN: 'disable' }));
  assert.throws(() => assertIsolatedEnvironment({ AKISMET_KEY: 'false', LOGIN: 'force' }));
  assert.throws(() => assertIsolatedEnvironment({}));
});
test('TM-015, TM-016: route gate rejects auth, override, traversal, legacy and OAuth surfaces', () => {
  for (const url of ['/api/user', '/user', '/api/oauth', '/api/token', '/api/db', '/api/comment/rss', '/api/comment/1', '/api/comment?type=list', '/api/comment?type=recent', '/api/comment?method=delete', '/api/comment?state=fake', '/api/comment?id=1', '/api/comment?unexpected=1', '/api/%63omment', '/api/comment/../user', '//external.invalid/api/user']) {
    assert.equal(allowedRequest({ method: 'GET', url, headers: {} }), false, url);
  }
  assert.equal(allowedRequest({ method: 'GET', url: '/api/comment?path=%2Fposts%2Fa', headers: {} }), true);
  assert.equal(allowedRequest({ method: 'POST', url: '/api/comment', headers: {} }), true);
  assert.equal(allowedRequest({ method: 'GET', url: '/api/comment', headers: { authorization: 'Bearer fixed-fixture' } }), false);
});
