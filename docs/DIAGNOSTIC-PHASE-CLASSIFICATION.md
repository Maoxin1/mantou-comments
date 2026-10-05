# Diagnostic phase classification — 2026-10-05

Source publication approved on 2026-10-05. At this source checkpoint the classification update has passed local verification but has not been deployed or run against the configured database.

## Observed production validation

The protected staged deployment of commit `cbd9020040730d501161fa990bb6866cee14ed03` received one authorized report POST at 2026-10-05 14:47:11 UTC. It returned the following sanitized diagnostic result:

- status: `connection_failed`
- transport: `unconfirmed`
- failureClass: `connection`
- diagnosticHttpStatus: `503`

The report page itself rendered with HTTP 200; that is not a database acceptance pass. Configuration validation passed, but the generic connection stage includes driver loading, Pool creation and connection establishment. The underlying cause remains unknown. No TLS success, table-state result, schema/data write or administrator setup is established by this attempt.

Both existing production addresses remained on the original placeholder. The staged deployment has no aliases and anonymous access redirects to Vercel Authentication. The successfully issued temporary CLI session was logged out (logout exit 0; subsequent whoami exit 1, Logged out). An earlier canceled login showed browser consent success without completing a usable local token exchange; that orphaned consent's server cleanup is unestablished. The entire CLI application was not disconnected.

## Bounded changes

Two runtime source files change, with two additive test files. Existing test files, deployment routes, credentials, fixed SQL, TLS verification, read-only guards, single-attempt behavior and timeout durations remain unchanged.

Failure reports add allowlisted `failurePhase` and `failureReason` values. They distinguish configuration, module loading, Pool creation, connection establishment, explicit TLS verification, read-only confirmation, catalog query and cleanup. Recognized DNS, TCP, certificate, authentication, database, protocol, server-error, connection-limit and timeout codes map to fixed labels. Unknown codes and raw messages are never returned or logged.

The installed pg/pg-pool's own code-less timeout can fire at its 5-second deadline before the diagnostic's outer 5.5-second deadline. An offline reproduction demonstrated the previous misclassification. Exact known driver timeout messages now map to `timeout` / `driver_timeout`; the outer deadline remains `deadline_timeout`. No timeout was increased, and a Neon cold-start explanation remains unverified.

For an exact supported PgBouncer startup-rejection message, the optional `failureSetting` is limited to one of seven fixed configuration-key names. Unknown fields, values, suffixes and trailing newlines are discarded. This is diagnostic presentation only; no startup safety setting is removed. Message forms are grounded in [PgBouncer's source](https://github.com/pgbouncer/pgbouncer/blob/master/src/client.c), not an assertion about this deployment's actual cause.

## Dependency and release limits

No dependency changed. The package-lock SHA256 remains `62a039f5430cc756528907c062408f436c65d073999adffa8d91d63a318871d9`. The last audit snapshot was zero known vulnerabilities at 12:44 UTC on 2026-10-05. No fresh registry audit was performed for this reporting-only patch.

This update is based on public source commit `cbd9020040730d501161fa990bb6866cee14ed03`. It changes diagnostic reporting only; the latest actual database result remains the failed check above. Another real check requires the protected staged-deployment scope and a fresh action-time CLI grant if CLI is used. Schema creation, data writes, administrator bootstrap and comment activation are separate gates.

## Verification

A fresh copy of the published source was installed from the existing offline npm cache: 285 packages, install scripts disabled, no registry audit. The final nine additive tests failed 9/9 against the unchanged published runtime files. Replacing only the two patched runtime files made the complete suite pass: 61 application tests plus 4 reference regressions, 65 total. Syntax checks and `npm ls --all --offline` also passed; the aggregate command exited 0. All 14 existing test/helper file hashes match the pre-patch record.

An independent bounded review additionally caught JavaScript's end-anchor behavior before trailing newlines; startup-message recognition now requires full-string equality, with LF and U+2028 negative tests. These are synthetic/offline tests, not evidence of a successful real database connection.
