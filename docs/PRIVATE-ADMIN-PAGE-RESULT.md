# Private setup and login checkpoint

2026-10-06. This records the local implementation checkpoint before publication. Setup/login, direct PostgreSQL adapter wiring and an optional staged profile are implemented locally. No real account, key, password, database connection, publication or deployment occurred.

## Implemented

- Separate owner-held capability before password input or storage. This is possession authorization, not Vercel visitor identity; broad project-member login is insufficient.
- A visible Source and licenses link on every private page, preserving the corresponding-source offer.
- Server-bound approved identity; closed public signup/OAuth; no mail or notification services. Reader email stays optional.
- Separate signing key, purpose-bound HS256, issuer/audience checks, Secure/HttpOnly/SameSite cookies, role/email reread, route-bound CSRF, exact origin/host/form fields, 4 KiB body and five-second read limits. Fixed private window at most 24 hours; cookies at most 15 minutes.
- Locked single-administrator creation using installed bcrypt. Unknown COMMIT outcomes prohibit resubmission pending read-only reconciliation. Logout clears browser cookies; copied stateless tokens expire rather than being server-revoked.
- Actual pinned Waline/PostgreSQL model/parser, with only driver transport faked for tests. Fresh bounded hostname/certificate-verified direct leases are destroyed after use. Read-only bootstrap preflight pins neondb/neondb_owner and checks used user fields, key/sequence, privileges, ownership and absence of RLS/unexpected triggers/rules. Full schema acceptance remains a separate prerequisite.
- Corrected field/ID mapping, UTC timestamps both directions, public-only metadata discovery and per-adapter metadata cache isolation. No SQL CRUD implementation was replaced.

## Evidence and limits

The final receipt is verification/private-admin-local-result.json. Original 85 tests and assertions remain intact. Added tests cover HTTP setup/login, runtime guards, real model/parser behavior, and a joined runtime → page → core → adapter path over fake pg transport. These do not prove PostgreSQL execution, durability or deployed-browser behavior.

No local PostgreSQL server was available. Headless visual capture was blocked by the local sandbox's socket restriction; markup and actual local HTTP behavior passed, but screenshots are not claimed. The existing public entrypoint and prior diagnostic profile remain unchanged.

Vercel's default Node helpers consume request bodies before the handler. The optional profile sets NODEJS_HELPERS=0 for build and runtime; runtime refuses any other value. A fresh real build must verify bundled dynamic source dependencies and .vc-config.json shouldAddHelpers:false, then routed access-form behavior and a synthetic invalid-key POST before the owner enters secrets. The previously installed official @vercel/node 18.0.0 and @vercel/nft 1.10.0 were subsequently located. A clean-environment offline trace includes all five dynamically loaded storage/schema files and the resolved nested @waline/core entry and dependencies. This is not a remote build or live-runtime acceptance; that gate remains. Do not use env pull or export production credentials.

Last known audit: 0 findings at 2026-10-05 12:44 UTC, unchanged lock SHA-256 62a039f5430cc756528907c062408f436c65d073999adffa8d91d63a318871d9. No new audit transmission or dependency change.

## Required controls for a future live acceptance

Only an explicitly authorized protected, unaliased Production setup/login deployment may use this profile in mantou-comments. Both public aliases stay on the original inert deployment; restore the known secondary alias immediately if moved.

Separately approve and personally securely provision two distinct high-entropy values, PRIVATE_ADMIN_ACCESS_KEY and JWT_TOKEN. Never send them in chat, source, command-line arguments or logs. Configure the already approved email/name through PRIVATE_ADMIN_EMAIL and PRIVATE_ADMIN_DISPLAY_NAME, PRIVATE_ADMIN_ENABLED=true, and a one-hour PRIVATE_ADMIN_EXPIRES_AT UTC ISO value. NODEJS_HELPERS=0 must apply at build and runtime. Verify protection and absence of bypass/share exceptions first.

The owner then personally enters/submits the access key and password to create exactly one administrator. This is persistent access and requires action-time confirmation. Accept only confirmed creation, fresh real login/logout/login, repeat setup refusal and no sensitive output. Unknown outcomes stop for an authorized read-only account check. Retire the private window and log out the staging CLI session afterward.

This page has no moderation controls or test-comment writes. The tested core moderation sequence awaits its separately bounded live acceptance. Public comments and the blog server URL remain disabled.

## Official runtime sources

- https://vercel.com/docs/functions/runtimes/node-js/advanced-node-configuration#disabling-helpers-for-nodejs
- https://vercel.com/docs/project-configuration/vercel-json#buildenv
- https://github.com/vercel/vercel/blob/c628be7835e03a965b93e9cf9e2bd5ac2acbf5eb/packages/node/src/build.ts#L650-L653
- https://github.com/vercel/vercel/blob/c628be7835e03a965b93e9cf9e2bd5ac2acbf5eb/packages/node/src/serverless-functions/helpers.ts#L261-L289

Independent review: GO for local preparation; build, platform protection and real PostgreSQL acceptance remain open.
