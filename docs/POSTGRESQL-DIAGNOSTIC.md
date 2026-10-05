# Local read-only PostgreSQL diagnostic preparation

Prepared 2026-10-05. This adds a separately callable diagnostic, not a working
comment backend. No live database connection, schema/admin write, credentials
readback, deployment, source push or blog activation is part of this checkpoint.

## Boundary

- `index.cjs` is unchanged. New `diagnostic.cjs` also returns constant 503 and imports
  no database code. No environment flag can enable either entrypoint.
- `src/postgresql-diagnostic.cjs` is server-only and has no import-time effects. Its
  trusted caller must explicitly provide the environment object. It accepts only
  the four split `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD` and
  `POSTGRES_DATABASE` values. It never reads a connection URL, falls back to local
  storage, or accepts a target/query/table from an HTTP request. Port 5432 and the
  three public-schema table names are fixed. The configured target must be a
  syntactically valid Neon DNS hostname. A later live run must also verify that
  the deployment's integration belongs to the approved database project.
- It uses the installed `think-model-postgresql` socket directly, without loading
  ThinkJS, Waline controllers, notifications, custom-model fallback or admin
  registration. A new socket holds one checked-out client. PostgreSQL `max: 1`
  caps the actual pool; upstream `connectionLimit: 1` alone would not do that.
- TLS requires certificate verification and TLS 1.2 or 1.3. The connected stream
  must report encrypted and authorized before any statement. Connection/session
  defaults are explicit, including replication disabled as string `false` to
  prevent pg's ambient environment fallback. Native pg bindings are unsupported.
- Startup options force read-only mode and the pg_catalog search path. A fixed
  `BEGIN READ ONLY`, `SHOW transaction_read_only`, one catalog SELECT and
  `ROLLBACK` run through the real socket on the same retained checkout. The
  connection is then destroyed and the pool closed, on success or failure.
- The query inspects only `public.wl_comment`, `public.wl_counter`, and
  `public.wl_users`, plus schema USAGE / table SELECT privileges. It reads no
  comment/user rows or counts and does not inspect administrator identities.
  Exact expected ordinary tables come from the
  [pinned upstream schema](https://github.com/walinejs/waline/blob/c4b0f1ebb9a7970d36493d4c3580f3f43e098fa5/assets/waline.pgsql).
  Missing tables are an expected possible result, never an invitation to create
  them automatically.
- Driver timeouts are 5s connect, 3s client query, 2s statement, 1s lock and 3s idle
  transaction. Wrapper deadlines are 5.5s connect, 3.5s per statement and 2s close.
  These are response deadlines, not proof of a real transport shutdown.
  A checkout arriving after the deadline is discarded; an unresponsive query causes destructive
  release rather than another statement. No retry/fallback occurs.
- All results use fixed enums and table identifiers. Exceptions, target,
  credentials, SQL, stack traces, certificate fields and raw catalog data are
  never returned or logged. Pool/client error events are consumed and fail the
  diagnostic. Cleanup failure cannot report success.

`src/protected-diagnostic-handler.cjs` is only a factory. It needs a separately
reviewed trusted authorization callback returning literal true, before environment
access. Missing/failed authorization returns the same 503. It accepts only a POST to one fixed path and rejects declared nonempty/chunked body framing.
The request body is never read or used. The handler shares a single result per warm instance. It is
not a cross-instance rate limiter or an implementation of Vercel authentication.
Do not authorize by trusting a request header, hidden path or enable flag.
There is no routing/deployment configuration that exposes this factory now.

## Verified and unverified

The synthetic subprocess suite blocks DNS/net/TLS calls, replaces only pg.Pool's
transport, and executes the actual installed PostgreSQL socket implementation.
An additional real pg.Client constructor test verifies ambient-option handling
without connecting. Original application/reference test files and dependency
lock/tarball remain unchanged.

These checks establish wiring, failure handling and read-only query intent. They
are **not evidence of a real TLS handshake, provider connectivity, existing tables,
complete columns/indexes/sequences, valid writes, moderation, persistence,
least-privilege role, backup/restore, or production acceptance**. Startup options
must work with the actual Neon endpoint/pooler; on incompatibility, stop and
investigate without weakening TLS or read-only checks.

## Next authorization, separately from activation

User-configured variables were reported as Production-only and locked. Do not
pull/read/copy their values or broaden them to Preview. The narrow next action is
an unpromoted Production-target deployment in the existing `mantou-comments`
project, using its already configured integration credentials only at runtime,
with Vercel Authentication verified before invocation. Keep current production
aliases on the inert deployment. Use the existing signed-in owner session; do not
create a token, bypass secret, shareable link or service account.

[Vercel's current protection documentation](https://vercel.com/docs/deployment-protection)
says Standard Protection covers generated deployment URLs but excludes production
domains. [The deploy CLI documentation](https://vercel.com/docs/cli/deploy#skip-domain)
documents `--prod --skip-domain` for a Production deployment without domain
assignment. These are documented capabilities, **not verification of this
project's actual settings or available publishing tool**. Before upload, inspect
protection scope, target, existing aliases, exceptions and supported deployment
flow without viewing secret values. If stronger/new protection settings are
needed, obtain the specific security-setting approval first. If the tool cannot
create a staged deployment, stop rather than using a normal promoted deployment.

Suggested narrowly scoped approval:

> May I publish the reviewed diagnostic source update to Maoxin1/mantou-comments,
> create one protected, unpromoted Production diagnostic deployment in the existing
> Vercel mantou-comments project, and use its existing Neon integration credentials
> at runtime for one read-only connection/table-permission check? The current
> public service stays disabled. Schema creation, administrator setup and comment
> activation will need separate approval.

The diagnostic authorization binding and deploy manifest must be reviewed before
that upload. Verify unauthenticated access is blocked before the authenticated
empty POST. Then record only sanitized results, confirm aliases still point to
the inert deployment, and stop. This approval does not grant schema/data writes,
new credentials, billing changes or administrator/bootstrap actions.

## Source availability

The previously published source snapshot is
[199d1e1](https://github.com/Maoxin1/mantou-comments/commit/199d1e1b80f1fe3a19c9f640f42e6e501b51c8d3).
These diagnostic additions are local and licensed AGPL-3.0-or-later under the
existing license choices. They have not yet been published. Before users interact
with a deployed modified version, publish the exact new corresponding wrapper
source, tests and build instructions and associate them with that deployment's
revision/source offer. The unchanged upstream/core/dependency archives remain
available through the existing source Release; preserve their hashes/notices and
reference them explicitly rather than implying that an old source ZIP already
contains this new code.

## Local result

Fresh-directory offline `npm ci --ignore-scripts --no-audit --no-fund` installed
285 packages. Syntax checking, 43 application/diagnostic tests, four unchanged
reference regressions and `npm ls --all` passed. The live registry audit returned
zero known advisory matches. No assertions were skipped or removed. Verified
runtime: Node 24.19.0, npm 11.9.0, Python 3.12.14.

Run `npm run test:diagnostic` for the 10 new synthetic tests, or `npm test` for
the full 47-test contract. The reference runner needs its existing offline cache
as described in README; it does not install retired dependencies in the app.

## Authorized staged-deployment adapter

After approval of the diagnostic deployment, `deployment/staged-readonly.cjs`
adds a fixed generated-host/Production/project binding and a no-query HTML form.
A same-origin empty form POST enters the diagnostic factory. These checks are
routing/CSRF guards; authentication remains the independently verified Vercel
edge protection, not an HTTP header or cookie tested by this application. The
project has Standard Protection enabled; new deployment protection and alias
preservation must still be verified before clicking the form. The root and all
ordinary requests continue to return 503.

`vercel.diagnostic.json` is a separate deployment profile; the diagnostic upload
must explicitly select it as `vercel.json`. It does not activate the public
entrypoint or change the existing candidate profile. The profile targets sin1,
uses script-disabled installation, and routes only the diagnostic paths to the
staged adapter. The adapter refuses either existing production alias. Setting
`target=production` alone is not evidence that aliases were left unchanged.

Four additional adapter/profile tests bring the local contract to 51 tests (47 app/
diagnostic plus four reference). They cover a no-query GET, denied aliases/
metadata/cross-origin/body-framing cases, and a same-origin synthetic POST. The
previous 47-test checkpoint remains valid for its earlier local-only snapshot.

The upload profile uses modern zero-config Node functions (`api/readonly.js` and
`api/disabled.js`) and the documented `functions` maximum duration. It does not
mix legacy `builds` with `functions`. A root `.npmrc` also disables lifecycle
scripts as defense in depth, independently of the explicit install command.
