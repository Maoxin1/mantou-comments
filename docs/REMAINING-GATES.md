# Remaining gates after the PostgreSQL-only derivative

**Current source-release update:** the owner approved the full-source GPLv3/AGPL route on 2026-10-05. See SOURCE-RELEASE-PLAN.md and LICENSE-CHOICES.md. Earlier blanket clarification/review gates below are historical; current blockers are source/notice completeness, a verified public source offer at an authorized destination, and real-service acceptance. Public repository and Release ZIP publication are approved for `Maoxin1/mantou-comments`; publication verification remains a release step. Deployment and database activation are outside this approval.

2026-10-05. Local dependency/install gates have passed; production remains disabled.

## Cleared local gates

- Genuine clean install and valid dependency tree
- Known dependency audit matches: 16 initially → 14 after compatible overrides → 0 in the PostgreSQL-only application derivative
- Deterministic, integrity-checked generation with preserved core/controller/license bytes
- All original 29 tests plus eight new derivative tests; malformed-request privacy and measured bootstrap/request transport containment
- Verified-TLS configuration and suppression of SQL/connection logging, tested at Pool/socket configuration level only

## Licensing before public distribution or deployment

Resolve the server/core MIT metadata versus shipped GPL-v2-or-later notice and review retained AGPL dependencies and corresponding-source obligations. The derivative remains private, preserves all relevant upstream notices, and does not assert MIT-only licensing. See LICENSE-REVIEW.md. No third party has been contacted.

## Database and administration (GAP-005/006/007/009)

1. Confirm the authorized provider/account/region/plan, isolated database or branch, spending boundary, and existing-data status
2. Securely configure least-privilege access and a separate explicit JWT secret only after authorization. Never put real credentials in chat, source, snapshots or logs
3. Integrate the actual PostgreSQL adapter through the reviewed boundary; verify valid/invalid certificate and hostname handling on the real isolated service. Current tests do not connect to a database
4. Choose and verify a private administrator bootstrap. Closed registration is containment, not a usable administrator workflow
5. Run real create → pending → admin approval → second-reader visibility, including replies; connection-loss/unknown-write outcomes, restart durability, transactions/concurrency, backup and isolated restore

## Specification-dependent branches

- Parent/reply validity and lifecycle: missing/cross-article/hidden/deleted parent, invalid pid/rid and delete/write races; administrator posting exception and receipt/spam wording (including GAP-003/010)
- Input/Unicode rules, accepted links/media, byte/field/request limits, rate/timeout/reply-tree budgets and retry outcome protocol (GAP-008/014)
- What metadata can be collected/stored/transmitted, retention/deletion and backup responsibility (GAP-005/009)
- Concurrency/new-read visibility (GAP-013); frontend draft/persistence choices (GAP-012)

Already-fixed choices stay fixed: posts+works; shared Chinese/English discussion for the same content; anonymous readers with optional email; premoderation of reader roots/replies; no first-release automatic email. Enabled-email matrix cases remain postponed, not passed by the no-mail tests.

## Activation gate

Keep backend public routing and blog serverURL disabled until licensing and all applicable P0 acceptance pass. The Vercel placeholder and an audit result are not production acceptance. This pass created no real DB, credentials, administrator session, migration, deployment, push or blog change.

Earlier gate wording is preserved in REMAINING-GATES-PRE-DERIVATIVE.md as history.
