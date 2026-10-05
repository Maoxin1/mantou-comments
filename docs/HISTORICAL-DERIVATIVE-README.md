# Mantou Waline PostgreSQL-only local preparation

Current checkpoint: 2026-10-05. **Dependency cleanup passes; deployment/activation is still blocked by licensing and uncompleted real-service acceptance.**

The private local package is `@mantou/waline-postgresql@1.43.4-mantou.1`, derived reproducibly from the official `@waline/vercel@1.43.4` archive. It is installed under the existing `@waline/vercel` dependency key for local compatibility. It is a modified package, not an official Waline release.

## Verified result

- Clean `npm ci --ignore-scripts` succeeds; `npm ls --all` and syntax checks pass
- Final audit has **zero known vulnerability entries**; the audit command exits 0 without exclusions or ignores
- **37 tests pass:** 33 application/pruning/provenance tests and the 4 unchanged original dependency regressions in a temporary reference installation
- The original 29 assertions remain: 25 application tests are unchanged, and the 4 tests of removed request/qs dependencies are preserved verbatim in the reference suite. Eight new tests verify the derivative
- Seven unused direct dependencies and their retired SDK/driver branches are absent from the application installation
- Two offline generations produce identical archive and manifest bytes; a tampered upstream archive is rejected
- Thirty-three protected upstream files, including all controllers/logic, bundled core, PostgreSQL inheritance helpers and both license texts, are preserved byte-for-byte
- Public `index.cjs` still returns 503 for every request without loading Waline or any model. The derived package's own direct entrypoint also throws rather than bypassing the reviewed wrapper

Zero audit findings means no currently reported advisory matches in the inspected dependency tree. It does not establish vulnerability-free software, licensing clearance or production readiness.

## Reproduce

Verified runtime: Node 24.19.0, npm 11.9.0, Python 3.12.14 and zlib 1.3.2. The archive-generation runtime is recorded in `evidence/derivative/generator-runtime.txt`.

```
npm run build:derivative
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm test
npm ls --all
npm audit --json
```

Generation is fully offline from the vendored integrity-pinned official input. Application installation uses the lockfile and official registry tarballs. Lifecycle scripts stay disabled.

The reference tests deliberately use the former package/lock in a disposable OS temporary directory, separate from the application. Their original assertions are unchanged. Reference installation is offline by default and uses `MANTOU_NPM_CACHE`, or the OS temporary `mantou-waline-npm-cache` directory. On a new machine, prime that cache through the locked temporary installation with:

```
MANTOU_REFERENCE_ALLOW_NETWORK=1 npm run test:reference
```

This allows official locked package downloads; it never enables package lifecycle scripts. The temporary reference installation is removed on completion. It is not part of the application dependency audit or any prospective upload. A missing cache/test failure is an error, never an implicit skip.

## What remains blocked

- Licensing: server/core metadata says MIT while both shipped licenses say GPL v2 with a v2-or-later notice; retained ua-parser-js declares AGPL-3.0-or-later. Notices are preserved; public distribution/deployment requires clarification/review
- Real PostgreSQL provider/region/plan, credentials and least-privilege configuration are not established
- No real DB connection/TLS handshake, SQL execution, restart durability, transaction/race, backup/restore or administrator moderation workflow has been tested
- Private administrator bootstrap and unresolved privacy/retention, failure budgets, parent/reply lifecycle and other specification decisions remain open

The custom-model callback is trusted code. The tests use only an in-memory fixture; the wrapper is not a sandbox for arbitrary callbacks. PostgreSQL Pool options and socket logging have been checked with synthetic values and a fake connection only.

See [derivative result](docs/POSTGRESQL-DERIVATIVE.md), [licensing evidence](docs/LICENSE-REVIEW.md) and [remaining gates](docs/REMAINING-GATES.md). Earlier audit/test logs are retained under `evidence/` and `evidence/hardening/`; their old statuses are historical.

No deployment, repository creation, push, credentials, database resources, administrator account, external notification or blog `serverURL` change was performed.
