# Protected diagnostic reporting fix

## Actual first attempt

The first deployed diagnostic used source commit
`431b6e7ad244538d929c9179e488d4dfc89be0dd`. Vercel recorded exactly one
POST to `/__diagnostics/postgresql` at 2026-10-05 14:06:21 UTC with HTTP 503.
The browser navigated to an error page; the JSON result was not retrieved.
The redacted runtime logs do not establish whether configuration, authorization,
TLS, authentication or the query failed. No successful database acceptance is
claimed, and that request was not silently repeated.

## Additive change

- Existing JSON routes, public503 handler and all 51 prior tests stay unchanged
- A separate protected `/__diagnostics/report` GET shows a no-input form
- Its POST reuses the same Origin/framing checks and the same per-instance,
  single-flight diagnostic as the old JSON endpoint; it reads no request body
- It renders an allowlisted HTML report with HTTP200, even for a failed diagnostic
- The report preserves `diagnosticHttpStatus: 503` and the actual failed status
  and explicitly says that display success is not database acceptance
- Invalid Origin/framing is displayed as `request_rejected`, without reading
  database configuration or making a connection
- Host/project/environment mismatches still receive the unchanged inert503
- Known driver codes map to fixed categories such as authentication, network,
  TLS verification or unavailable database; all other codes stay generic
- Raw codes/messages, values, SQL, certificates and stack traces are never echoed
  or logged; the report escapes HTML and sends no-store / CSP protections

The five new regression tests were observed failing before implementation and
passing after it. The previous test/helper files are byte-identical. An
independent review also checked cross-endpoint single-flight reuse and found no
blocking issue. These are local tests, not another real database attempt.

Select `vercel.diagnostic-report.json` as the upload's `vercel.json`; the previous
profile remains unchanged for provenance. Before another real request, verify
source publication, the staged deployment's exact source, protection and alias
state. Use `/__diagnostics/report` for the new browser attempt. Do not submit both
forms or treat either per-process caching or HTTP200 as evidence of a successful
or globally once-only database operation.

## Operational limits found during the first deployment

Vercel CLI `--prod --skip-domain` preserved the primary production domain, but
still reassigned the project's secondary generated alias. That alias was restored
to the original placeholder after explicit approval. Do not promise that the flag
alone preserves every generated alias; a next deployment needs a specific plan
for this observed behavior before invocation.

The temporary CLI session completed official server logout successfully; a
separate non-interactive identity check reported logged out. The entire CLI app
connection was not disconnected, so revocation of every other token/refresh-token
family is not established. This avoids disturbing unrelated possible sessions.

## Local validation

A fresh offline application installation added 285 packages. All 56 tests passed:
52 application/report tests and the four unchanged reference regressions. Syntax
checks and `npm ls --all` passed. The original 51-test files are unchanged.

The application lockfile remains SHA256
`62a039f5430cc756528907c062408f436c65d073999adffa8d91d63a318871d9`.
The earlier 2026-10-05 12:44 UTC audit snapshot reported zero known vulnerabilities
for this identical lockfile. No fresh audit result is claimed for this
reporting-only change; the diagnostic still does not establish production safety.
