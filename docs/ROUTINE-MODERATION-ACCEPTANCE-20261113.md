# Routine moderation acceptance — 2026-11-13

The application runtime from PR #3 was tested against an isolated local PostgreSQL 16.2 server, using synthetic accounts and comments. Its three runtime files remain byte-identical to head `538ad77196fef5549d21ddb52c42e8d1fedbc1ba`; exact Git blobs and scope are in [the evidence record](../verification/routine-moderation-20261113.json).

## Observed results

- A real Edge browser completed owner access and password login, then reached all 25 synthetic waiting comments across two pages. Mobile and desktop pages rendered without page errors.
- Page-two rejection committed `waiting → spam`, preserved navigation and kept the comment absent from public counts. Restore committed `spam → waiting` without publishing.
- A separate connection changed a comment before stale approval executed. The real conditional SQL update affected no row; the browser received 409 and the newer rejection survived.
- Separate explicit approval published only the selected synthetic item. Invalid pagination returned 400.
- Fresh adapter connections read the committed states. After normal PostgreSQL server restart, a separate real driver query confirmed those same states persisted.

The pinned pg driver, core and Think query builder ran against actual PostgreSQL. The harness changed only the connection destination to loopback and added the temporary test CA, retaining certificate and hostname verification. The browser's synthetic generated origin was mapped to loopback, including redirects. No production host, account, password, owner key or data was used. The temporary PostgreSQL version is an isolated test baseline, not a recommendation or assertion about hosted patch levels.

## Replay prerequisites

[The optional local harness](../scripts/acceptance/routine-moderation.cjs) is excluded from default application tests and refuses to start without explicit opt-in. Supply a disposable PostgreSQL cluster on 127.0.0.1:55436 with the fixture role `neondb_owner`, a TLS certificate for `ep-maintenance-fixture.neon.tech`, and a certificate/key pair for the synthetic generated browser hostname used by the harness. No production connection values are accepted. It creates only a uniquely named synthetic database; the cluster and data remain operator-owned after the run.

Install a separately pinned Playwright Core with a browser and set `MANTOU_LOCAL_ACCEPTANCE=1`, `MANTOU_ACCEPTANCE_OUTPUT` to an evidence directory outside the repository containing `server.crt` and `server.key`, and `MANTOU_BROWSER_MODULE` to that local module. Run `node scripts/acceptance/routine-moderation.cjs`. The HTTPS listener binds loopback port 443 and fails if occupied; it never replaces another listener. Windows uses Edge, other platforms require Playwright Chromium. A subsequent operator-controlled PostgreSQL restart and independent read are required to repeat the separate restart result.

## Release boundary

This evidence closes the local browser and SQL execution/normal-restart persistence gaps. It does not establish Neon-hosted acceptance, Vercel deployment protection, production owner login, live moderation, crash recovery or arbitrary concurrent workloads. The protected generated host, owner key, password, short session, CSRF and absolute access expiry are unchanged. Source merge does not reopen or extend private access, change environment variables or deploy a new profile.

Original application and reference assertions remain in place. Check the exact updated PR/main CI before claiming repository validation. Deployment or live comment writes require their own concrete authorized scenario; uncertain write results still require reconciliation rather than automatic retry.
