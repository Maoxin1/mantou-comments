# Remaining gates after the initial backend checkpoint

Update: the local lock/clean-install gate and tested parser/bootstrap/privacy repairs have been completed as documented in [SECURITY-HARDENING.md](SECURITY-HARDENING.md). The initial items below are retained as history; the dependency audit still has 14 entries (1 critical), and all real-DB, production/admin and unresolved behavior gates remain open.

## Immediate technical work, no new product choice required

1. Repair the dependency lock and obtain a genuine clean `npm ci` plus the complete test rerun. Triage the exact audit branches and fixes; do not apply npm's suggested downgrade to Waline 0.23.13 or jump protobuf major versions without compatibility evidence
2. Test and harden errors before the current response plugin (payload parsing/logic/trace). Current 15 tests certify only their explicit scopes. Continue raw-response allowlist coverage when any endpoint is opened
3. Establish same-article valid-parent/rid rejection and atomicity with the chosen real adapter. The fixture only tests a valid approved parent. Missing/cross-article/hidden/deleted parent and delete/write races are not solved by this scaffold
4. Keep backend public routing and blog `serverURL` disabled until all applicable P0 gates pass. The inert Vercel project is not a backend acceptance result

## Database and administrator prerequisites (GAP-005/006/007/009)

- Confirm the authorized provider/account/region/plan, actual existing database or isolated test branch, spending boundary and whether old data exists. No real DB or persistent credential is present here
- Pin the production adapter and schema, apply schema only under authorization, and securely configure least-privilege access through the approved handoff. No secrets go in chat, source, logs or the zip
- Published Waline 1.43.4 `src/config/adapter.js` maps `PG_SSL=true` to `{rejectUnauthorized:false}` and enables `model.common.logSql:true`. Review and correct certificate verification/SQL logging explicitly rather than copying environment-variable examples blindly. A Neon connection string alone does not prove secure adapter setup
- Choose and test a private administrator bootstrap that never exposes an empty-user-store public registration route. Current API blocking prevents takeover; it does not create a usable administrator account or moderation workflow
- Run real isolated create → pending → admin approval → second anonymous reader flows, including reply moderation; restart/connection-loss checks, privacy/error assertions, backup/export and isolated restore. In-memory adds are not durability proof

## Small product choices still needed only for their dependent branches

- Administrator posting exception; current submitter receipt/spam wording; what happens to replies when a parent is hidden/deleted (GAP-003/010)
- Input/Unicode counting, allowed links/media, request/field limits, rate/timeout/reply-tree budgets and retry outcome protocol (GAP-008/014). This scaffold deliberately does not invent values
- Which metadata may be collected/stored/outbound, retention/deletion and backup responsibility (GAP-005/009). The isolated no-outbound/avatar policy is a safety hold, not a newly approved permanent product design
- Concurrency/new-read visibility rules (GAP-013); frontend persistence/draft choices remain GAP-012

Already fixed choices stay fixed: posts+works, shared Chinese/English discussion for the same content, no reader registration, optional email, premoderated reader comments/replies, first-release automatic mail disabled. They must not be reopened as questions merely because technical acceptance remains.

## Non-claims

No SQL execution, real administrator login, production comment, deployment, push, backend activation, external mail or actual payment took place. No unrequested account/access token was created. A denied/closed admin endpoint is not an admin workflow test. No advisory exploit was executed; an audit match alone does not establish route exploitability or lack of it.
