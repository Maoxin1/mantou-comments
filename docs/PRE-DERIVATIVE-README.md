# mantou Waline backend: bounded local preparation

## Latest local security checkpoint

Clean installation and the targeted security repairs now pass. The final dependency audit still reports **14 affected package entries (1 critical, 8 high, 5 moderate)**, so deployment/activation remains blocked. See [security hardening](docs/SECURITY-HARDENING.md) and `evidence/hardening/full-test-final.log` for the latest tests. The material below preserves the original checkpoint and is superseded where the new report says so.

Status at 2026-10-05 09:50 UTC: **not ready to deploy or activate**. The public `index.cjs` returns 503 for every request and imports neither Waline nor a database. The existing Vercel placeholder, blog `serverURL`, repository and production data were not changed.

This implements and tests a deliberately small anonymous-reader adapter against the real npm package `@waline/vercel@1.43.4` (its bundled dependency is `@waline/core@0.1.0`). The blog client remains 3.15.2 with its existing frontend patch. Node 24.19.0/npm 11.9.0 were used.

## What is implemented

- Public adapter routes are limited to anonymous comment list/count/create. Registration, login, OAuth, dashboard, export, updates, deletes, recent-comments and legacy/encoded route alternatives are closed. This prevents first-administrator takeover while bootstrap remains unresolved; it does **not** implement an administrator bootstrap or review UI
- All anonymous roots and replies use `audit:true`; an incoming `status:approved` or forged `user_id` does not grant publication
- Omitted/empty email is accepted by the tested backend flows without registration
- Comment/receipt JSON is projected to declared public fields, recursively including replies. Raw mail/IP/UA, auth fields, unknown extensions and avatar-derived external identifiers are removed. A constant data-URI avatar is used only for this isolated candidate
- SMTP, webhook, push and CAPTCHA-service configuration fails closed. The OAuth-service list is a local data URL. External anti-spam remains disabled in this isolated candidate pending its data-flow decision
- Controller/model errors return generic unknown-result errors. A simulated error immediately after an in-memory add is not described as definitely unsaved
- No production database integration, migration, credentials, account, admin session, deployment, external notification or blog activation was created

`src/candidate.cjs` is a custom-model test adapter, intentionally not wired to the public entrypoint. `vercel.candidate.json` documents only the inert route; it is not a request or instruction to deploy.

## Actual evidence

- `evidence/upstream-red-final.log`: the same seven HTTP contract tests against upstream with audit and no-network fixture settings yielded **3 pass / 4 fail**. Genuine counterexamples: raw UA in public list and submission receipt; first-user registration; legacy `/user` registration. Anonymous update/delete/export authorization was accepted as either HTTP 401/403 or the matching Waline error envelope, rather than mistaking envelope HTTP 200 for successful authorization
- `evidence/green-final.log`: **15/15 pass** against this adapter. Local HTTP exercises the real installed Waline parser/router/controller/core/formatter. Storage is the explicitly synthetic `test/memory-model.cjs`
- `evidence/syntax-check.log`: syntax check passed
- `evidence/lockfile-ci.log`: **clean install failed** before replacing modules: npm reports `Missing: ws@5.2.7 from lock file`. The initial generated lock is not yet a reproducible installation
- `evidence/green-clean-install.log`: 15/15 pass after that failed command, on the existing install. Despite its filename this is **not clean-install evidence**
- `evidence/dependency-audit.json`: **16 affected-package audit entries: 3 critical, 8 high, 5 moderate**. These counts include transitive/aggregate entries; they are not 16 independently reproduced exploits. No automatic remediation was applied

The first policy unit tests were characterization tests and ran green. They are not claimed to have an earlier failing state. No real browser, real PostgreSQL/Neon, restart durability, transaction/concurrency, backup/recovery, production HTTP or administrator moderation test was run.

## Commands

On the original prepared installation:

```
npm test
npm run check
REFERENCE_UPSTREAM=1 node --test --test-concurrency=1 test/http-contract.test.cjs
npm audit --omit=dev --json
```

The reference command intentionally fails the four target contracts. Installation used the official npm registry with lifecycle scripts disabled. `npm ci --offline --ignore-scripts --no-audit --no-fund` was attempted and failed as recorded. Do not work around this by silently removing the lock or claiming install reproducibility; dependency/lock repair is the next bounded task.

## Scope of acceptance

Existing stable IDs are retained: local subsets of TM-004, TM-013, TM-015, TM-016, AC-022, AC-023, AC-034; INV-001/002/005/007/012. The full matrix rows remain blocked where they require real service, administration or unresolved behavior. TM-035–037 email-enabled cases remain postponed; testing the first-release no-mail branch does not mark those enabled-email cases passed.

Same-content Chinese/English sharing and posts/works page coverage are frontend mapping/build acceptance items, not proven by this backend fixture. Requests in these tests use synthetic canonical paths only.

The plugin boundary runs after upstream payload parsing and logic. Generic controller/model faults are tested; parser/logic/trace errors before that boundary and all resource/byte budgets are **not yet certified**. This is one explicit next security test, not an implicit assertion that all error paths are safe.

See `docs/REMAINING-GATES.md` and `docs/DEPENDENCY-TRIAGE-INITIAL.md`. This record describes the initial local checkpoint only.
