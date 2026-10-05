'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const http = require('node:http');
const { once } = require('node:events');
const requestRequire = createRequire(require.resolve('request'));
const FormData = requestRequire('form-data');
const qs = requestRequire('qs');
test('GHSA-fjxv-7rqg-78g4: request multipart boundaries never use Math.random', () => {
  const original = Math.random;
  Math.random = () => { throw new Error('INSECURE_RANDOM_BOUNDARY'); };
  try { assert.match(new FormData().getBoundary(), /^[a-zA-Z0-9-]+$/); }
  finally { Math.random = original; }
});
test('GHSA-hmw2-7cc7-3qxx: multipart field names and filenames cannot inject headers', () => {
  const form = new FormData();
  form.append('field"\r\nX-Synthetic-Injection: yes', Buffer.from('hello'), { filename: 'name"\r\nX-Synthetic-File: yes' });
  const encoded = form.getBuffer().toString();
  assert.ok(!encoded.includes('\r\nX-Synthetic-Injection:'));
  assert.ok(!encoded.includes('\r\nX-Synthetic-File:'));
  assert.ok(encoded.includes('%0D%0A'));
});
test('GHSA-4mjr-xmp4-gh2g: request query serializer safely round-trips constructor.isBuffer data', () => {
  const value = qs.parse('x[constructor][isBuffer]=synthetic', { plainObjects: true });
  assert.doesNotThrow(() => qs.stringify(value));
});
test('request compatibility: patched multipart and query dependencies preserve local HTTP fields', async () => {
  const request = require('request');
  let observed;
  const server = http.createServer(async (req, res) => {
    const parts = []; for await (const part of req) parts.push(part);
    observed = { url: req.url, body: Buffer.concat(parts).toString(), contentType: req.headers['content-type'] };
    res.end('ok');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    await new Promise((resolve, reject) => request.post({ url: `http://127.0.0.1:${server.address().port}/check`, qs: { nick: 'Reader 测试', n: 2 }, formData: { comment: 'Local synthetic text', upload: { value: Buffer.from('attachment'), options: { filename: 'fixture.txt', contentType: 'text/plain' } } }, proxy: null }, (err, res, body) => err ? reject(err) : (assert.equal(body, 'ok'), resolve())));
    assert.equal(new URL(observed.url, 'http://localhost').searchParams.get('nick'), 'Reader 测试');
    assert.match(observed.contentType, /^multipart\/form-data; boundary=/);
    assert.ok(observed.body.includes('name="comment"')); assert.ok(observed.body.includes('Local synthetic text'));
    assert.ok(observed.body.includes('filename="fixture.txt"')); assert.ok(observed.body.includes('attachment'));
  } finally { server.close(); await once(server, 'close'); }
});
