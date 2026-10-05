'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
test('WAL-022, WAL-024: public entrypoint stays inert without loading Waline or any model', async () => {
  const before = Object.keys(require.cache);
  const handler = require('../index.cjs');
  const added = Object.keys(require.cache).filter((key) => !before.includes(key));
  assert.ok(added.every((key) => !key.includes('node_modules')));
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    for (const [path, method] of [['/', 'GET'], ['/api/user', 'POST'], ['/api/comment', 'POST'], ['/ui', 'GET']]) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method });
      assert.equal(response.status, 503); assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await response.json(), { errno: 503, errmsg: 'Comments are not enabled' });
    }
  } finally { server.close(); await once(server, 'close'); }
});
