'use strict';
// Public entrypoint stays inert until database, bootstrap and release gates pass.
// Deliberately does not import Waline or read any credentials.
module.exports = function disabledBackend(_req, res) {
  res.statusCode = 503;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify({ errno: 503, errmsg: 'Comments are not enabled' }));
};
