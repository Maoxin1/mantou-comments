# Approved PostgreSQL-only derivative: local result

**Current source-release update:** the owner approved the full-source GPLv3/AGPL route on 2026-10-05. See SOURCE-RELEASE-PLAN.md and LICENSE-CHOICES.md. Earlier blanket clarification/review gates below are historical; current blockers are source/notice completeness, a verified public source offer at an authorized destination, and real-service acceptance. Public repository and Release ZIP publication are approved for `Maoxin1/mantou-comments`; publication verification remains a release step. Deployment and database activation are outside this approval.

2026-10-05. **Approved local implementation is complete. Known dependency audit matches are zero. Public distribution/deployment remains blocked by licensing and real-service acceptance.**

## Identity and scope

- Upstream: official npm `@waline/vercel@1.43.4`, immutable archive integrity verified before generation
- Derived: private `@mantou/waline-postgresql@1.43.4-mantou.1`
- Installed through the existing root dependency key `@waline/vercel`, using a local integrity-locked tarball
- Direct package entry throws. Root production `index.cjs` remains unconditional 503
- The reviewed `src/bootstrap.cjs` still permits only explicitly supplied custom models and named services; tests use memory models. Arbitrary injected callbacks are trusted code, not sandboxed
- No real database, credentials, administrator, deployment, repository creation, push, notification or blog configuration change occurred

## Exact removal and preserved behavior

Removed direct dependencies:

1. `@cloudbase/node-sdk`
2. `leancloud-storage`
3. `akismet`
4. `think-model-mysql`
5. `think-model-mysql2`
6. `think-model-sqlite`
7. `think-mongo`

The corresponding external storage/Akismet services and unused launch files are omitted from the derived archive. No Cloudbase metadata-probe import remains. Retired transitive trees such as request, axios, protobufjs, old UUID and Lodash path utilities are absent from the application installation and every nested location in its lockfile.

The PostgreSQL storage adapter inherits source helpers named mysql.js/base.js/order.js; those files remain byte-identical. Their names do not indicate an installed MySQL driver or selectable MySQL configuration. Controller, logic and bundled core files are unmodified. Thirty-three protected files, including both exact LICENSE texts, are hash-verified against the original archive.

Changes are limited to package identity/dependency metadata, fail-closed entrypoint, PostgreSQL-only configuration, removal of Mongo extension registration, transparent version headers, dated modification/provenance notices, and removal of unused files. `x-waline-version: 1.43.4` identifies the retained upstream protocol; `x-mantou-build: 1.43.4-mantou.1` identifies the modified build.

The derived PostgreSQL configuration verifies certificates, requires TLS 1.2 or newer, disables SQL and connection-URI logging, and requires an explicit JWT_TOKEN rather than using a database password as fallback. The main isolated wrapper also prevents runtime configuration snapshots and normal storage fallback. These facts do not establish a working or production-ready database integration.

## Reproducibility

`scripts/build-derivative.py` performs no network calls. It verifies the original archive's SHA-512, applies exact transformations, preserves protected source/license bytes, and writes a sorted tar archive with fixed timestamps, ownership, modes and gzip metadata. The manifest enumerates every changed, removed and protected file.

Verified with Python 3.12.14/zlib 1.3.2. Two consecutive offline generations produce byte-identical archive and manifest files. A changed input archive is rejected before output is written. An independent read-only review reproduced the current files, compared all 70 installed package files to the archive, and confirmed all 33 protected files and the exact change/removal sets.

- Input: `vendor/upstream/waline-vercel-1.43.4.tgz`
- Output: `vendor/generated/mantou-waline-postgresql-1.43.4-mantou.1.tgz`
- Manifest: `vendor/derivation-manifest.json`
- Generator: `scripts/build-derivative.py`
- PostgreSQL configuration replacement: `patches/adapter.postgresql.js`

All original licenses/notices are preserved; see LICENSE-REVIEW.md. A repeatable build is not a license clearance.

## Test preservation and before/after evidence

All prior nine test/helper files are byte-identical, verified against the pre-derivative hashes. The four tests that directly exercise request/form-data/qs now live verbatim under `reference/test/`; the other 25 existing application tests stay in the application suite. No assertion was deleted, weakened, skipped or made optional.

`npm test` runs:

- 33 application tests: the prior 25 plus eight derivative tests
- 4 unchanged reference dependency tests

The reference runner installs the exact former package/lock in a fresh OS temporary directory with scripts disabled, runs the original tests, and removes the temporary installation in a finally block. It is offline by default; an explicit documented option permits priming the cache from locked registry artifacts on a new machine. The reference tree is never installed in application node_modules. The root application audit covers the application manifest/lock; it is not falsely presented as an audit of the retained historical/reference source. `.vercelignore` also excludes the reference fixture and original upstream archive from any future separately reviewed application upload.

Evidence under `evidence/derivative/`:

- `pruning-red.log`: seven initial tests against the unpruned package, five failures/two passes
- `pruning-green-final.log`: all eight current derivative tests pass; the tampered-input test is additional characterization, not claimed as one of the five original failures
- `clean-install-final.log`: successful final clean install, 285 installed packages instead of the preceding 516
- `test-final.log`: final 33 application + 4 reference passes
- `syntax-final.log`: syntax check passes
- `dependency-tree-final.json`: npm ls exits 0
- `dependency-audit-final.json`: full npm audit exits 0, with zero known entries at all severities and no exclusions/ignores
- `original-test-preservation.json`: exact old-to-current test/helper hash mapping
- `generation-first.json`, `generation-final.json`, `generator-runtime.txt`: reproducibility records
- `dependency-license-metadata.json`: package license metadata inventory, not a legal compliance conclusion
- `final-result.json`: consolidated result and artifact/source hashes

Earlier actual dependency/bootstrap/parser red→green logs remain in `evidence/hardening/`. The audit history is 16 entries initially, 14 after compatible patches, and 0 after this approved pruning. The original failed and intermediate audit records were not overwritten.

## Remaining release decision

No further blind dependency-audit loop is needed for this checkpoint. The next release-blocking issue is the verified license conflict and retained AGPL dependency review; obtain upstream clarification or qualified review before public distribution/deployment. No third-party contact has been sent.

Real PostgreSQL setup and private administrator bootstrap then require their own authorization and acceptance evidence: valid/invalid certificate handling, actual SQL and persistence, moderation, restart/connection-loss outcomes, transactions/races, backup/restore, and resolution of the open specification gates. See REMAINING-GATES.md. The current suite uses a memory model and fake query connection, not a real database or administrator workflow.

## Upgrade responsibility

The distinct private package name makes the fork visible, but security tools may not automatically associate future advisories against the upstream package name with it. For every upstream update, review upstream release/security notices and retained source changes, update the pinned archive intentionally, regenerate, compare protected hashes/change sets, preserve notices, and rerun the full clean-install/test/audit gates. Do not assume a future zero audit result automatically clears upstream-code advisories or licensing.
