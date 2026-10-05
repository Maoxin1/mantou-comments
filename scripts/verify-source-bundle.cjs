'use strict';
// Original project addition; AGPL-3.0-or-later, see COPYING.AGPL3.
// Run from an extracted source bundle, not the pre-existing project checkout.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const sourceRoot = path.resolve(root, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'third_party/npm-source-artifacts.json')));
const cache = process.env.MANTOU_BUNDLE_CACHE || fs.mkdtempSync(path.join(os.tmpdir(), 'mantou-bundle-cache-'));
const archives = manifest.packages.map(item => {
  const filename = path.join(sourceRoot, item.archive);
  const data = fs.readFileSync(filename);
  if (crypto.createHash('sha512').update(data).digest('base64') !== item.integrity.slice('sha512-'.length)) throw new Error(`Archive integrity mismatch: ${item.name}`);
  return filename;
});
function run(command, args, env = {}) {
  const result = spawnSync(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} failed with ${result.status}`);
}
console.log(`Validated ${archives.length} exact registry archives; seeding a dedicated cache`);
for (let i = 0; i < archives.length; i += 40) run('npm', ['cache', 'add', '--offline', '--ignore-scripts', '--cache', cache, ...archives.slice(i, i + 40)]);
run('npm', ['run', 'build:derivative']);
run('npm', ['ci', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', cache]);
run('npm', ['run', 'check']);
run('npm', ['test'], { MANTOU_NPM_CACHE: cache });
run('npm', ['ls', '--all']);
console.log('Fresh extracted application/reference verification passed without registry downloads. Audit is a separate live check.');
