# Historical pre-derivative security checkpoint

**Superseded for current status:** the user subsequently approved the PostgreSQL-only derivative. It is implemented, and the current application audit has zero known advisory entries. See [POSTGRESQL-DERIVATIVE.md](POSTGRESQL-DERIVATIVE.md). Counts and recommendations below describe the earlier checkpoint only; licensing and real-service acceptance still block release.

2026-10-05, following the initial 09:50 UTC preparation checkpoint. Still **not ready to deploy or activate**. No real database, credentials, administrator bootstrap, deployment, push, or blog configuration change is part of this work.

## Applied repairs

1. Regenerated the inconsistent npm lock using npm 11.9.0. A genuine `npm ci --ignore-scripts --no-audit --no-fund` now succeeds, followed by `npm ls --all` without peer-placement errors. No `--legacy-peer-deps`, audit suppression, version downgrade or deletion of the lock was used.
2. Kept `@waline/vercel` exactly 1.43.4. Scoped only request's transitive `form-data` to 2.5.6 and `qs` to 6.16.0. These stay within the respective major versions. All three targeted library regressions fail before the override and pass after it; a real loopback HTTP multipart/query compatibility test also passes. This is compatibility evidence for the exercised operations, not a guarantee for every request option.
3. Added `src/bootstrap.cjs`, a local isolated wrapper using the pinned ThinkJS loader. It loads only the actual upstream avatar/core/notify services, not any external storage or Akismet service. Controller, logic and bundled core source is still from the unchanged upstream archive. It prevents resolved configuration snapshots, rejects alternate storage environment settings, and forbids a missing custom model from silently falling back to storage.
4. The wrapper sets PostgreSQL SSL to `rejectUnauthorized:true` / `minVersion:TLSv1.2`, and both `logSql:false` and `logConnect:false`. Tests inspect the actual resolved configuration and actual pg.Pool options, and exercise the actual PostgreSQL socket class with synthetic credentials and a fake query connection to check logging. **No PostgreSQL connection, certificate handshake, SQL execution, persistence or database authorization has been tested.** This configuration is preparation for future adapter integration only; the current tests use only the explicit memory fixture, and alternate storage environment settings/fallback services are blocked. The injected model callback is trusted code, not runtime-certified as an in-memory class or sandboxed against its own I/O.
5. Replaced upstream debug-trace middleware with an outer generic error/projection boundary before payload parsing and logic. A malformed-JSON real HTTP test now returns a generic 400/no-store envelope without submitted sentinel, stack, package path or console-error sentinel. Unknown-write outcomes remain unknown, not falsely unsaved.
6. Bootstrap and selected malformed/valid reader flows now instrument HTTP, HTTPS, net.Socket, TLS and fetch. Only the test server's loopback connection and the local data URL are allowed. No external transport attempt is observed on those tested paths. This is scoped test evidence, not a universal network sandbox or a proof for untested future features.

## Real before/after evidence

All paths below are under `evidence/hardening/`:

- `lock-repair.log`, `clean-install-baseline.log`: repaired baseline lock and first successful clean installation
- `dependency-regression-red.log`: 3 target failures / 1 local compatibility pass on original request dependencies
- `dependency-regression-green.log`: same 4 tests pass after overrides
- `bootstrap-red.log`: 4/4 fail against the original eager bootstrap, including an intercepted HTTP attempt and intercepted config snapshot; test spies block transmission/persistence
- `bootstrap-green.log`: original four bootstrap assertions pass with the wrapper
- `preparse-red-final.log`: the two selected parser/privacy and transport assertions fail against upstream bootstrap with the original public plugin
- `preparse-green.log`: 4/4 parser/transport/model-isolation tests pass after the wrapper
- `clean-install-final-verified.log`: second final genuine clean installation succeeds
- `full-test-final.log`, `syntax-final.log`, `dependency-tree-final.json`: final complete suite, syntax check and valid dependency tree
- `upstream-source-hashes.json`: unchanged Waline archive integrity versus the original lock, plus hashes of installed controller/logic/core source for review

`preparse-red.log` is an earlier interrupted reference attempt, not completed evidence. It entered an undesired upstream missing-model fallback; no fixture database file was found afterward. The completed reference rerun selects only the two intended parser/transport assertions. The candidate's missing-model regression passes without fallback. The initial verification's `green-clean-install.log` retains its original misleading name; it is historical existing-install evidence, superseded by the successful clean installs above.

## Audit remains a release gate

Original: 16 affected package entries (3 critical, 8 high, 5 moderate).
Final: **14 affected package entries (1 critical, 8 high, 5 moderate)**; `npm audit` still exits 1.

The two removed entries are form-data and qs. request falls from inherited critical to moderate. Counts include propagated parent packages; they are not counts of demonstrated reader exploits. Nothing was marked ignored or accepted.

The remaining direct trees are:

- `@waline/vercel → @cloudbase/node-sdk@3.18.3 → @cloudbase/database@1.4.3 → lodash.set@4.3.2 / lodash.unset@4.5.2`; the SDK also includes axios@0.27.2
- `@waline/vercel → leancloud-storage@4.15.2 → leancloud-realtime@5.0.0-rc.8 / leancloud-realtime-plugin-live-query@1.2.0 → protobufjs@5.0.3`; uuid@3.4.0 is also present
- `@waline/vercel → akismet@2.0.7 → request@2.88.2 → tough-cookie@2.5.0 / uuid@3.4.0`

Exact advisory IDs/ranges remain in `dependency-audit-final.json`; the initial triage document enumerates the original advisories. These residual packages remain installed, but bootstrap tests prove their import trees are absent from the isolated wrapper's loaded modules. This does not clear the package-level release gate.

### Advisory and reachability distinctions

- [GHSA-fjxv-7rqg-78g4](https://github.com/advisories/GHSA-fjxv-7rqg-78g4): multipart boundary randomness; [GHSA-hmw2-7cc7-3qxx](https://github.com/advisories/GHSA-hmw2-7cc7-3qxx): multipart header injection. Both repaired at request's FormData dependency. Akismet's current API uses URL-encoded forms; neither exploit was established through that call.
- [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g): qs constructor.isBuffer round-trip failure, reproduced with synthetic library input and repaired. This is not proof of an exposed Waline route.
- [GHSA-xq3m-2v4x-88gg](https://github.com/advisories/GHSA-xq3m-2v4x-88gg): remaining critical protobufjs finding requires attacker-influenced schemas/descriptors. The default Leancloud storage entry does not load its separate realtime entry; no reader path to attacker-controlled schema loading was identified.
- [GHSA-p6mc-m468-83gw](https://github.com/advisories/GHSA-p6mc-m468-83gw): lodash.set remains unpatched in the Cloudbase tree. Its observed sink processes realtime update paths; no Waline watch call was found.
- [GHSA-p8p7-x288-28g6](https://github.com/advisories/GHSA-p8p7-x288-28g6): request SSRF has no upstream patched request version. [GHSA-72xf-g2v4-qvf3](https://github.com/advisories/GHSA-72xf-g2v4-qvf3) and [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) also remain. Installed uuid users observed here call v4; the advisory concerns buffer handling in v3/v5/v6.
- Cloudbase SDK initialization itself invokes an Axios cloud-metadata HTTP probe, independent of selecting a custom memory/Postgres model. This is a proven startup egress attempt in the intercepted red test. It does not prove exploitation of the individual Axios advisories. The allowlisted wrapper removes that import/initialization path.

## Additional source-confirmed pre-DB hazards and remaining work

Original upstream `src/config/adapter.js` disables certificate verification for PG_SSL=true and enables SQL logging. `think-model-postgresql/lib/socket.js` defaults logConnect=true and emits a URI containing the password. `thinkjs/lib/loader.js` writes resolved config, including jwtKey and adapter credentials, to the runtime directory. The wrapper addresses these paths for this isolated preparation, without supplying real credentials.

A production adapter must still verify certificate/hostname rejection on an isolated real provider, least-privilege grants, connection-loss/unknown-write outcomes, restart durability, transactions/races, moderation and private administrator bootstrap. Privacy retention/deletion, failure/resource budgets and unresolved specification choices remain as listed in REMAINING-GATES.md.

Next dependency recommendation: prepare a separately reviewed, deterministic PostgreSQL-only derived package from the pinned upstream archive, removing unused service import edges **and their dependency declarations** while hash-checking preserved controllers/core. This is not implemented here. PostgreSQL inherits its storage helper from `storage/mysql.js`, so that helper, `base.js` and `order.js` must remain even if MySQL drivers are removed. Do not silently remove node_modules, apply the suggested downgrade to 0.23.13, or force protobuf5→7 / uuid3→11 major overrides. The wrapper depends on pinned internal loader APIs, so it also needs explicit upgrade review.

## Finite next decision

Official npm dist-tags were checked at this checkpoint: `latest` is still 1.43.4 (`evidence/hardening/upstream-dist-tags.json`), so there is no newer published latest release to test as an immediate upstream fix. These SDKs are normal hard dependencies, not optional dependencies that npm can omit for PostgreSQL. The recommended next step, if ongoing maintenance is acceptable, is explicit adoption of the small deterministic PostgreSQL-only derived package described above. Prepare/review that patch before any resource creation; then require its clean install, complete tests and fresh audit. If a maintained derivative is not wanted, keep this candidate disabled and wait for an upstream packaging/fix release. Do not continue blind audit-fix retries.
