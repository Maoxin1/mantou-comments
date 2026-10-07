'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPublicComments } = require('../deployment/public-comments.cjs');
const HOST = 'mantou-comments-synthetic-mantous-projects-af7e7067.vercel.app';
function fixture() {
  let calls = 0;
  const handler = createPublicComments({ VERCEL_ENV: 'production', VERCEL_PROJECT_ID: 'prj_NtBPfOSSwqaOLH0tejtx7Da5eE9Q', NODEJS_HELPERS: '0', PUBLIC_COMMENTS_ENABLED: 'true', VERCEL_URL: HOST, PRIVATE_ADMIN_ENABLED: 'true', PRIVATE_ADMIN_EXPIRES_AT: new Date(Date.now() + 3600000).toISOString().replace(/\.\d{3}Z$/, 'Z'), PRIVATE_ADMIN_ACCESS_KEY: 'A'.repeat(64), JWT_TOKEN: 'B'.repeat(64) }, {
    createPrivatePage: () => async (_req, res) => { calls++; res.statusCode = 200; res.end('synthetic private page'); },
  });
  async function call(url, method = 'GET', host = HOST) {
    const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(text) { this.text = text; } };
    await handler({ url, method, headers: { host } }, res);
    return res;
  }
  return { call, calls: () => calls };
}
test('routine moderation routing: only GET queue navigation reaches the protected private page', async () => {
  const f = fixture();
  assert.equal((await f.call('/__private?view=spam&page=2')).statusCode, 200);
  assert.equal(f.calls(), 1);
  for (const method of ['POST', 'PUT', 'DELETE']) assert.equal((await f.call('/__private?view=spam&page=2', method)).statusCode, 503);
  for (const host of ['mantou-comments.vercel.app', 'mantou-comments-mantous-projects-af7e7067.vercel.app', 'evil.invalid']) assert.equal((await f.call('/__private?view=spam&page=2', 'GET', host)).statusCode, 503);
  for (const path of ['/__private/access?page=2', '/__private/login?view=spam', '/__private/setup', '/__private/other?page=2', '//evil.invalid/__private?view=spam']) assert.equal((await f.call(path)).statusCode, 503);
  assert.equal(f.calls(), 1);
});
