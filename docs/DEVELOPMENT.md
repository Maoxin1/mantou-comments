# Development and verification

Prerequisites: Node 24.x, npm 11.9.0, Python 3.12, and POSIX shell utilities. The
application verification used Node 24.19.0. Exact core reconstruction separately
requires Node 24.20.0 on Linux x86-64/glibc. Do not supply production credentials
for the tests; they use synthetic data, a memory model and fake query connection.

## Runnable Git checkout with registry access

From the repository root, use a dedicated cache. The reference helper is offline
by default, so its first run must explicitly populate that same cache:

```sh
CACHE="$(mktemp -d)"
npm run build:derivative
npm ci --ignore-scripts --no-audit --no-fund --cache "$CACHE"
npm run check
MANTOU_NPM_CACHE="$CACHE" MANTOU_REFERENCE_ALLOW_NETWORK=1 npm test
MANTOU_NPM_CACHE="$CACHE" npm test
npm ls --all
```

The first `npm test` permits registry reads for the four historical reference
regressions and primes the cache. The second invokes the same unchanged tests
with the reference helper's default offline install. Both must pass all 37
assertions. Keep using the same `MANTOU_NPM_CACHE` value on future test runs, or
repeat the explicit network-priming command for a new cache. Do not silently skip
reference tests or install their retired SDKs into the application. The helper
creates and removes a separate temporary reference installation automatically.

`npm ci` above is network-enabled; package lock integrity is enforced and
lifecycle scripts are disabled. `npm audit --json` is a separate current network
check. The committed audit JSON is a dated snapshot, not a live guarantee.

## Fully offline application replay

Download the complete source-and-notice ZIP and accompanying `SHA256SUMS` from
the matching GitHub Release. Check the ZIP hash before extracting it:

```sh
sha256sum --check SHA256SUMS
unzip mantou-waline-public-source-and-notices-20261005.zip
cd mantou-waline-source-20261005/application
node scripts/verify-source-bundle.cjs
```

That helper is designed for the **complete extracted bundle layout**, with
`application/` next to `third_party/`. It verifies and primes all 488 supplied
registry archives, rebuilds the derivative, installs offline with lifecycle
scripts disabled, and runs syntax checks, all 37 tests and dependency-tree
validation. It does not work from the smaller Git checkout until those complete
bundle inputs/layout are restored. Use the previous section for checkout tests.

## Byte-exact upstream source build

Use `core-rebuild/README.md` and its scripts from the complete ZIP. Large pinned
source/build archives are deliberately omitted from Git. The recipes and locks
remain browsable in this checkout. Exact core replay requires Node 24.20.0;
exact server repacking additionally requires npm 11.9.0 and is hardcoded to
dry-run mode. Nothing in these commands publishes, creates a database or deploys.
