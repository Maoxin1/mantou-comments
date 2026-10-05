# Mantou Waline complete-source release

Prepared 2026-10-05 for the approved GPLv3/AGPL complete-backend source route.
Approved public target: `Maoxin1/mantou-comments`, with this complete ZIP as a GitHub Release asset.
Publication and anonymous-download verification are separate release steps; this
archive does not claim they have already completed. No database or deployment is enabled.

## What is verified

- Application source: all original **37 tests pass** from a separate bundle directory with a fresh, offline-seeded npm cache
- Dependency audit: **0 known advisories** in the application tree; this is not a universal security guarantee
- Exact upstream source: Waline commit `c4b0f1ebb9a7970d36493d4c3580f3f43e098fa5`, all 1,396 tracked source blobs
- Core source rebuild: **all four JS/CJS/declaration outputs match byte-for-byte**
- Server packaging: safe `--dry-run --skip-build` reconstructs the **exact original npm archive**
- Derived package: deterministic PostgreSQL-only pruning retains all protected source/license bytes
- Upstream core tests: **17/17** passed in the original frozen monorepo installation; the compact offline replay rebuilds the core but does not include that entire test-tool closure

See `verification/` and `core-rebuild/evidence/` for exact scopes and results.

## Layout

- `application/`: wrapper, policy, tests, exact lockfiles, deterministic pruning script, patches, source/license choices, inert entrypoints and verified package inputs
- `core-rebuild/`: complete pinned upstream repository archive, original TypeScript/build inputs, exact locked compiler/package-manager artifacts, restored notices and portable rebuild scripts
- `third_party/npm/`: 488 integrity-verified official registry archives for the application and separate reference tests; the reference-only retired SDKs are not application dependencies
- `third_party/preferred-source-and-notices/`: 69 immutable upstream source archives, component/source mappings, restored notices, font metadata/licenses and explicit limits
- `SOURCE-MANIFEST.json`: SHA-256 and size for every included file except the manifest itself
- `COPYING.GPL3`, `COPYING.AGPL3`, `LICENSE-CHOICES.md`: downstream choices while preserving each upstream component's own grant

The collection uses explicit project/source allowlists. It contains no local credentials, user database records, comments, browser profiles or unrelated private projects. Application fixtures are synthetic. Public upstream source archives may contain their own published examples/test fixtures; their provenance and original bytes are retained. A pattern scan is supplied with its limitations.

## Fresh application verification

Prerequisites: Node 24.x, npm 11.9.0, Python 3.12, normal POSIX utilities, and several hundred MB of free space. The final replay used Node 24.20.0 on Linux x64/glibc.

From `application/`:

```
node scripts/verify-source-bundle.cjs
```

This verifies all 488 archive integrities, creates/seeds a dedicated cache, regenerates the derivative, performs a clean installation with lifecycle scripts disabled, runs syntax checks and all 37 tests, and checks the dependency tree. It does not fetch registry packages. The four unchanged reference tests run in a temporary separate installation that is removed afterward. Do not treat that historical reference tree as part of the deployed application.

A current audit is a separate network read:

```
npm audit --json
```

## Exact editable-source rebuild

For byte-exact core reconstruction, use Linux x86-64/glibc and **Node 24.20.0**. Node is a documented general-purpose prerequisite, not bundled or rebuilt here. Python standard library, Bash, tar/gzip and sha256sum are also prerequisites. The supplied compiler/package-manager archives are prebuilt general-purpose tools with preserved notices; this preparation did not rebuild those toolchains.

```
NODE_BIN=/path/to/node24.20.0 bash core-rebuild/scripts/rebuild-core.sh /tmp/mantou-core-check
```

The output directory must be new. The script reconstructs tools/source without previous caches/checkouts, builds unchanged TypeScript/configuration, and checks all four expected outputs.

With **npm 11.9.0** on PATH, reproduce the exact upstream server archive:

```
NODE_BIN=/path/to/node24.20.0 bash core-rebuild/scripts/repack-server-dry-run.sh /tmp/mantou-core-check /tmp/mantou-server-pack
```

The helper hardcodes dry-run flags and never enters npm publish. The expected server archive SHA-256 is `d719b6592178d0ad6f93a803def4b93cbb27fa812b6742dc32f732abed788a7c`. It matches the application generator's pinned upstream input. No production action is part of these commands.

## Source coverage and remaining limits

This bundle supplies original backend/core source, our changes, runtime artifacts, and extensive preferred-source/notice supplements. It does **not** claim that every third-party generated output, compiler, embedded asset or font was independently rebuilt.

The main explicit source gap is MathJax font generation: its public packages refer to original font inputs and tools not currently available from a verified public release. The original font bytes and exact GUST/LPPL/OFL notices are included. This is a reproducibility/completeness limitation, not by itself a finding that bundling the unmodified fonts is prohibited. KaTeX font generation and Undici WASM regeneration were also not run; their available source/build material is supplied. The detailed dependency report leaves other mapping differences and test-only omissions visible.

The source-release route uses Waline's GPLv2-or-later grant through its GPLv3 option, combines with retained AGPL components, and licenses original additions under AGPL-3.0-or-later. It does not rely on resolving the historical MIT metadata discrepancy. Components/assets retain their own grants and notices; fonts are not blanket-relicensed GPL/AGPL.

Before activation, publish to the approved `Maoxin1/mantou-comments` target and provide a prominent, free, anonymous-access source download for the exact running backend version. Verify the published offer, archive checksum and version mapping; publication is not asserted by this archive. Real PostgreSQL/admin/moderation/durability, privacy/retention and other release gates remain independent and untested. The application entrypoint still returns 503.

## Historical package metadata

The generated derivative archive, its generator and derivation manifest retain
their exact verified pre-publication bytes, including earlier licensing-hold
wording. That historical status is superseded by `LICENSE-CHOICES.md` and
`application/docs/SOURCE-RELEASE-PLAN.md`; the upstream grants and notices remain
unchanged. This release makes no claim of production readiness.
