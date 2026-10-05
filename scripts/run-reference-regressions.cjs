'use strict';
// Retains the four original dependency regression assertions, unchanged, without
// installing retired SDK trees into the application. Reuses the locked official
// packages offline; temporary baseline dependencies are removed on completion.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mantou-reference-regressions-'));
let status = 1;
try {
  for (const name of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(root, 'reference', name), path.join(temp, name));
  fs.mkdirSync(path.join(temp, 'test'));
  fs.copyFileSync(path.join(root, 'reference/test/dependency-security.test.cjs'), path.join(temp, 'test/dependency-security.test.cjs'));
  const install = spawnSync('npm', ['ci', ...(process.env.MANTOU_REFERENCE_ALLOW_NETWORK === '1' ? [] : ['--offline']), '--ignore-scripts', '--no-audit', '--no-fund', '--cache', process.env.MANTOU_NPM_CACHE || path.join(os.tmpdir(), 'mantou-waline-npm-cache')], { cwd: temp, stdio: 'inherit' });
  if (install.status !== 0) throw new Error('Reference fixture installation failed; do not silently skip its tests');
  const test = spawnSync(process.execPath, ['--test', 'test/dependency-security.test.cjs'], { cwd: temp, stdio: 'inherit' });
  status = test.status ?? 1;
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
process.exitCode = status;
