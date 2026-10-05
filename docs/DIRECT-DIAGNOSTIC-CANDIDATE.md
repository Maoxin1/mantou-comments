# Same-endpoint direct diagnostic — 2026-10-05

This is a targeted diagnostic compatibility change, not a confirmed repair of the live failure. No database was connected, modified or activated while preparing this update.

## Established evidence

The user-run deployment of commit `82c2dbb3343cfb3f0330af745eb5c66023ca39fe` is READY in sin1 with no aliases. Its single protected POST at 22:02:43 UTC returned connection_failed / connect / protocol_rejected / transport unconfirmed. The old label combines Node EPROTO and PostgreSQL SQLSTATE 08P01, so it cannot establish a password, network or TLS cause. Unconfirmed transport means the code never reached its explicit post-checkout TLS verification, not proof that TLS failed.

The Production dashboard shows a Neon-managed PGHOST_UNPOOLED variable. Only the variable name was inspected; no value was revealed or copied. Its actual relationship to POSTGRES_HOST is checked inside the proposed runtime, not assumed from its presence.

## Minimal change and fail-closed rule

Only this diagnostic changes connection routing. If the configured POSTGRES_HOST has the documented first-label -pooler suffix, require an existing PGHOST_UNPOOLED string exactly equal to removing that suffix. No other endpoint, region, domain, URL, whitespace or missing value is accepted. On mismatch, fail before importing the driver or opening a connection. Never synthesize a destination and use it without this independent configured-host match.

Already-direct POSTGRES_HOST values remain unchanged. The same POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DATABASE are retained; no new credentials or URL parsing are introduced. Verified TLS, minimum TLS1.2, fixed read-only startup options/SQL, all timeout durations, max-one connection, logging silence, one-shot handling and public503 defaults remain unchanged.

The report adds only fixed labels:
- connectionRoute=same_endpoint_unpooled: the configured pooled host matched the existing direct host before connection
- connectionRoute=already_direct: the original host was already direct and routing was unchanged
- protocolSource=postgresql: the error code was exactly SQLSTATE08P01
- protocolSource=node_transport: the error code was exactly EPROTO

No arbitrary error code, message, hostname, credential or certificate detail is returned. Existing assertions prohibiting raw codes remain unchanged.

## Why this candidate is justified, but causality is not proven

Neon documents the [pooled/direct hostname relationship](https://neon.com/docs/connect/connection-pooling#how-to-use-connection-pooling) and recommends [an unpooled connection for unsupported startup parameters](https://neon.com/docs/connect/connection-errors#unsupported-startup-parameter). The installed pg8.23.1 sends our read-only options and server timeouts at startup, which a transaction pooler may reject. Direct routing preserves those protections rather than dropping them.

Neon's [proxy formatter](https://github.com/neondatabase/neon/blob/fa504217c61bbcaf5c512d75830564541f917f8f/proxy/src/compute/mod.rs) appends explanatory text to startup-rejection messages, which the previous exact-message matcher does not recognize. However, the same source revision's forwarding path uses XX000, not 08P01. Thus the missing failureSetting is not proof of a particular rejected setting, and this source does not conclusively explain the live bucket. No classifier-only deployment or removal of replication=false is proposed.

## Verification and interpretation

Three routing regressions failed against the published prior code and then passed. The full suite passes 70 tests (66 application + 4 reference), with syntax checks passing. All 16 previously published test/helper files are byte-identical. Synthetic tests cover exact endpoint equality, absent/mismatched values, genuine pg startup/TLS settings, fixed-label projection and the two actual error branches. An independent read-only review found no material blocker.

If the matched direct route reaches verified TLS and returns table statuses, connectivity on that route is established and pooler compatibility becomes the supported explanation, not a proven universal cause. If it is already_direct, no pooler bypass occurred. If identity validation fails, no connection is attempted. A further failure on the verified direct route must be reported with its fixed protocolSource; do not retry automatically or weaken protections.

The lock SHA256 remains `62a039f5430cc756528907c062408f436c65d073999adffa8d91d63a318871d9`. The prior audit showed zero known vulnerabilities at 2026-10-05 12:44 UTC; no new audit request was made. Publication and a refreshed Windows handoff were approved. A new cloud deployment/grant is not part of this preparation, and schema writes, administrator bootstrap and comment activation remain separate gates.
