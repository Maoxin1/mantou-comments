'use strict';
const { allowedRequest, reject, createPublicMiddleware, assertIsolatedEnvironment, STATIC_AVATAR } = require('./policy.cjs');
// Intentionally available only as an isolated custom-model adapter. No production
// database connector or administrator bootstrap is silently selected here.
function createIsolatedCandidate(model) {
  if (typeof model !== 'function') throw new TypeError('An explicit isolated test model is required');
  assertIsolatedEnvironment(process.env);
  const Application = require('./bootstrap.cjs').createIsolatedApplication;
  const handle = Application({
    model: (name, controller) => {
      if (!['Comment', 'Users', 'Counter'].includes(name)) throw new Error('Unknown isolated model');
      const result = model(name, controller);
      if (!result) throw new Error('Missing isolated model; storage fallback is forbidden');
      return result;
    },
    audit: true,
    disableUserAgent: true,
    disableRegion: true,
    oauthUrl: 'data:application/json,%7B%22services%22%3A%5B%5D%7D',
    avatarUrl: () => STATIC_AVATAR,
    plugins: [{ middlewares: createPublicMiddleware() }],
  });
  return function isolatedReaderCandidate(req, res) {
    if (!allowedRequest(req)) return reject(res);
    return handle(req, res);
  };
}
module.exports = { createIsolatedCandidate };
