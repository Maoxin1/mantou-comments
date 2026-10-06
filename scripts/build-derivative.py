#!/usr/bin/env python3
"""Reproduce a private, source-preserving Waline derivative. No network access."""
import base64, gzip, hashlib, io, json, pathlib, tarfile
ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'vendor/upstream/waline-vercel-1.43.4.tgz'
EXPECTED = 'sha512-g6qblq8i5H0ByDbsYRdPcsvauXicXfiLYhxIynwHpuYuawM1QuxAGkttQQgCOi+u960JFjbsQOmRzA0XHJfydw=='
VERSION = '1.43.4-mantou.1'
OUTPUT = ROOT / 'vendor/generated/mantou-waline-postgresql-1.43.4-mantou.1.tgz'
raw = SOURCE.read_bytes()
integrity = 'sha512-' + base64.b64encode(hashlib.sha512(raw).digest()).decode()
if integrity != EXPECTED:
    raise SystemExit('Refusing unverified upstream archive')
with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as tar:
    original = {}
    for member in tar.getmembers():
        if member.isdir(): continue
        if not member.isfile() or not member.name.startswith('package/'):
            raise SystemExit('Unexpected upstream archive member')
        name = member.name[len('package/'):]
        if '..' in pathlib.PurePosixPath(name).parts or name.startswith('/'):
            raise SystemExit('Unsafe upstream archive member')
        original[name] = tar.extractfile(member).read()
sha = lambda data: hashlib.sha256(data).hexdigest()
files = {name: data for name, data in original.items() if name in ['package.json', 'LICENSE'] or name.startswith(('src/', 'view/', 'node_modules/@waline/core/'))}
files['UPSTREAM-README.md'] = original['README.md']
removed_dependencies = ['@cloudbase/node-sdk', 'leancloud-storage', 'akismet', 'think-model-mysql', 'think-model-mysql2', 'think-model-sqlite', 'think-mongo']
pkg = json.loads(files['package.json'])
for name in removed_dependencies:
    if name not in pkg['dependencies']: raise SystemExit('Missing expected upstream dependency ' + name)
    del pkg['dependencies'][name]
pkg.update(name='@mantou/waline-postgresql', version=VERSION, private=True, main='index.js', license='SEE LICENSE IN LICENSE', description='Private local PostgreSQL-only derivative; public entry disabled; licensing review outstanding', upstreamVersion='1.43.4', mantouDerivative={'kind': 'postgresql-only', 'modified': '2026-10-05', 'upstreamIntegrity': EXPECTED})
for name in ['scripts', 'devDependencies', 'publishConfig']: pkg.pop(name, None)
files['package.json'] = (json.dumps(pkg, indent=2, ensure_ascii=False) + '\n').encode()
header = '// Modified 2026-10-05 for the local Mantou PostgreSQL-only derivative.\n// Upstream notices are preserved in LICENSE and DERIVATION.md.\n'
files['index.js'] = (header + "'use strict';\nthrow new Error('Direct entry is disabled; use the separately reviewed isolated bootstrap');\n").encode()
files['src/config/adapter.js'] = (ROOT / 'patches/adapter.postgresql.js').read_bytes()
s = original['src/config/config.js'].decode()
start = s.index('let storage = null;')
end = s.index('const forbiddenWords =', start)
s = s[:start] + "const storage = 'postgresql';\nconst jwtKey = JWT_TOKEN;\nif (!jwtKey) throw new Error('An explicit JWT_TOKEN is required; database-secret fallback is disabled');\n\n" + s[end:]
# Remove unused provider variables from the destructuring only; do not touch core logic.
for name in ['LEAN_KEY','MYSQL_DB','MYSQL_PASSWORD','TIDB_DB','TIDB_PASSWORD','SQLITE_PATH','PG_DB','POSTGRES_DATABASE','PG_PASSWORD','POSTGRES_PASSWORD','MONGO_DB','MONGO_PASSWORD','TCB_ENV','TENCENTCLOUD_SECRETKEY','TCB_KEY','GITHUB_TOKEN']:
    needle = f'  {name},\n'
    if s.count(needle) != 1: raise SystemExit('Unexpected config shape for ' + name)
    s = s.replace(needle, '', 1)
files['src/config/config.js'] = (header + s).encode()
s = original['src/config/extend.js'].decode()
for needle in ["const mongo = require('think-mongo');\n", '  mongo(think.app),\n']:
    if s.count(needle) != 1: raise SystemExit('Unexpected extend shape')
    s = s.replace(needle, '', 1)
files['src/config/extend.js'] = (header + s).encode()
files['src/middleware/version.js'] = (header + "const pkg = require('../../package.json');\nmodule.exports = () => async (ctx, next) => {\n  ctx.set('x-waline-version', pkg.upstreamVersion);\n  ctx.set('x-mantou-build', pkg.version);\n  await next();\n};\n").encode()
for name in list(files):
    if name == 'src/service/akismet.js' or (name.startswith('src/service/storage/') and pathlib.PurePosixPath(name).name not in ['base.js','mysql.js','order.js','postgresql.js']):
        del files[name]
files['DERIVATION.md'] = f'''# Private local Waline PostgreSQL derivative

Base: @waline/vercel 1.43.4, official npm archive integrity {EXPECTED}
Derived identity: @mantou/waline-postgresql {VERSION}; modified 2026-10-05.
This is a modified package, not an official Waline release.

Only PostgreSQL storage and its base/MySQL/order inheritance helpers remain.
Cloudbase, Leancloud, Akismet, MongoDB, SQLite, MySQL and TiDB integrations/drivers
have been removed. The MySQL storage helper is retained solely because PostgreSQL
inherits it; no MySQL driver/configuration remains. Direct package entry throws.
The application's public entrypoint is separately disabled. No deployment or DB
connection is approved or implied by this package.

The x-waline-version header identifies the upstream protocol version; the
x-mantou-build header identifies the modified package. Controller, logic, storage
PostgreSQL helpers and bundled @waline/core files are preserved byte-for-byte.
See the generation script and manifest in the local parent project for all changes.

## Licensing hold
The upstream package.json and bundled core package.json say MIT, but both shipped
LICENSE files contain GPL version 2 and a Waline v2-or-later notice. Those LICENSE
files and the bundled core metadata are preserved unmodified. The derivative uses
SEE LICENSE IN LICENSE and makes no MIT-only licensing claim. The original
manifest is retained in the pinned source archive. Other dependencies retain their
own licenses; ua-parser-js declares AGPL-3.0-or-later. No public redistribution,
publishing, production deployment or license-compatibility claim is made. Resolve
licensing and corresponding-source requirements before distribution/deployment.

Upstream README is historical reference, not instructions to enable this build.
'''.encode()
preserved = {}
for name, data in files.items():
    if name.startswith(('src/controller/', 'src/logic/', 'node_modules/@waline/core/')) or name in ['LICENSE', 'src/service/storage/postgresql.js','src/service/storage/mysql.js','src/service/storage/base.js','src/service/storage/order.js']:
        if original[name] != data: raise SystemExit('Protected upstream file changed: ' + name)
        preserved[name] = sha(data)
changes = {name: {'before': sha(original[name]) if name in original else None, 'after': sha(data)} for name, data in files.items() if original.get(name) != data}
removed = sorted(set(original)-set(files))
buffer = io.BytesIO()
with gzip.GzipFile(fileobj=buffer, mode='wb', filename='', mtime=0, compresslevel=9) as gz:
    with tarfile.open(fileobj=gz, mode='w', format=tarfile.USTAR_FORMAT) as tar:
        for name, data in sorted(files.items()):
            info=tarfile.TarInfo('package/' + name); info.size=len(data); info.mode=0o644; info.mtime=0; info.uid=info.gid=0; info.uname=info.gname=''
            tar.addfile(info, io.BytesIO(data))
OUTPUT.parent.mkdir(parents=True, exist_ok=True); OUTPUT.write_bytes(buffer.getvalue())
manifest={'upstream':{'name':'@waline/vercel','version':'1.43.4','integrity':EXPECTED,'sha256':sha(raw)},'derived':{'name':pkg['name'],'version':VERSION,'archive':OUTPUT.relative_to(ROOT).as_posix(),'sha256':sha(buffer.getvalue()),'integrity':'sha512-'+base64.b64encode(hashlib.sha512(buffer.getvalue()).digest()).decode()},'removedDependencies':removed_dependencies,'removedFiles':removed,'modifiedOrAddedFiles':changes,'preservedFiles':preserved,'licenseFileSHA256':sha(files['LICENSE']),'licenseStatus':'CONFLICT_REQUIRES_REVIEW_BEFORE_DISTRIBUTION_OR_DEPLOYMENT'}
(ROOT/'vendor/derivation-manifest.json').write_text(json.dumps(manifest,indent=2,sort_keys=True)+'\n', encoding='utf-8', newline='\n')
print(json.dumps({'artifact': str(OUTPUT.relative_to(ROOT)), 'sha256':manifest['derived']['sha256'],'preservedFiles':len(preserved),'removedDependencies':removed_dependencies}))
