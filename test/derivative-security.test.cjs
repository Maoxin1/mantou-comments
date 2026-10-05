'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const pkgRoot = path.dirname(require.resolve('@waline/vercel/package.json'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'vendor/derivation-manifest.json')));
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
test('derivative: local identity is distinct, private and explicitly tied to pinned upstream integrity', () => {
  const pkg = require('@waline/vercel/package.json');
  assert.equal(pkg.name, '@mantou/waline-postgresql');
  assert.equal(pkg.version, '1.43.4-mantou.1'); assert.equal(pkg.upstreamVersion, '1.43.4');
  assert.equal(pkg.private, true); assert.equal(pkg.mantouDerivative.upstreamIntegrity, manifest.upstream.integrity);
  assert.equal(pkg.license, 'SEE LICENSE IN LICENSE');
});
test('derivative: removed SDK/driver trees cannot be resolved from the application installation', () => {
  const excluded = ['@cloudbase/node-sdk','@cloudbase/database','leancloud-storage','leancloud-realtime','leancloud-realtime-plugin-live-query','akismet','request','axios','protobufjs','lodash.set','lodash.unset','uuid','think-model-mysql','think-model-mysql2','think-model-sqlite','think-mongo','mongodb','mysql','mysql2'];
  for (const name of excluded) {
    assert.throws(() => require.resolve(name), { code: 'MODULE_NOT_FOUND' }, `${name} remains installed`);
  }
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')));
  for (const location of Object.keys(lock.packages)) {
    if (!location.includes('node_modules/')) continue;
    const name = location.split('node_modules/').at(-1);
    assert.ok(!excluded.includes(name), `${name} remains in nested lock location ${location}`);
  }
});
test('derivative: only PostgreSQL storage plus its unchanged inheritance helpers remain', () => {
  const files = fs.readdirSync(path.join(pkgRoot, 'src/service/storage')).sort();
  assert.deepEqual(files, ['base.js','mysql.js','order.js','postgresql.js']);
  assert.equal(fs.existsSync(path.join(pkgRoot, 'src/service/akismet.js')), false);
  const model = require(path.join(pkgRoot, 'src/config/adapter.js')).model;
  assert.deepEqual(Object.keys(model).sort(), ['postgresql','type']);
  assert.equal(model.type, 'postgresql');
  assert.equal(model.postgresql.ssl.rejectUnauthorized, true);
  assert.equal(model.postgresql.logSql, false); assert.equal(model.postgresql.logConnect, false);
});
test('derivative: every protected controller, logic, core, PostgreSQL helper and license is byte-identical', () => {
  for (const [file, expected] of Object.entries(manifest.preservedFiles)) assert.equal(sha(fs.readFileSync(path.join(pkgRoot, file))), expected, file);
  assert.equal(sha(fs.readFileSync(path.join(pkgRoot, 'LICENSE'))), '010728bac3f86aa3c028f766a28f4ec2da4289335571dc9756e5a7d595de59bc');
  assert.equal(sha(fs.readFileSync(path.join(pkgRoot, 'node_modules/@waline/core/LICENSE'))), manifest.licenseFileSHA256);
});
test('derivative: direct package entry fails closed without bootstrapping services', () => {
  const before = new Set(Object.keys(require.cache));
  assert.throws(() => require('@waline/vercel'), /Direct entry is disabled/);
  assert.ok(Object.keys(require.cache).filter(p => !before.has(p)).every(p => !p.includes('/src/service/')));
});
test('derivative: two offline generations produce identical archive and manifest bytes', () => {
  const archive = path.join(root, manifest.derived.archive), manifestPath = path.join(root, 'vendor/derivation-manifest.json');
  const beforeArchive = sha(fs.readFileSync(archive)), beforeManifest = sha(fs.readFileSync(manifestPath));
  for (let i = 0; i < 2; i++) {
    execFileSync('python', ['scripts/build-derivative.py'], { cwd: root, stdio: 'pipe' });
    assert.equal(sha(fs.readFileSync(archive)), beforeArchive);
    assert.equal(sha(fs.readFileSync(manifestPath)), beforeManifest);
  }
  assert.equal(beforeArchive, manifest.derived.sha256);
});
test('derivative: installed package metadata declares no removed dependency or publication hook', () => {
  const pkg = require('@waline/vercel/package.json');
  for (const name of manifest.removedDependencies) assert.equal(pkg.dependencies[name], undefined, name);
  assert.equal(pkg.scripts, undefined); assert.equal(pkg.publishConfig, undefined);
});
test('derivative: a tampered upstream archive is rejected before any generated artifact is written', () => {
  const os = require('node:os');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mantou-derivation-tamper-'));
  try {
    fs.mkdirSync(path.join(temp, 'scripts')); fs.mkdirSync(path.join(temp, 'vendor/upstream'), { recursive: true });
    fs.copyFileSync(path.join(root, 'scripts/build-derivative.py'), path.join(temp, 'scripts/build-derivative.py'));
    const archive = Buffer.from(fs.readFileSync(path.join(root, 'vendor/upstream/waline-vercel-1.43.4.tgz'))); archive[archive.length - 1] ^= 1;
    fs.writeFileSync(path.join(temp, 'vendor/upstream/waline-vercel-1.43.4.tgz'), archive);
    assert.throws(() => execFileSync('python', ['scripts/build-derivative.py'], { cwd: temp, stdio: 'pipe' }), error => error.status === 1 && String(error.stderr).includes('Refusing unverified upstream archive'));
    assert.equal(fs.existsSync(path.join(temp, 'vendor/generated')), false);
    assert.equal(fs.existsSync(path.join(temp, 'vendor/derivation-manifest.json')), false);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
