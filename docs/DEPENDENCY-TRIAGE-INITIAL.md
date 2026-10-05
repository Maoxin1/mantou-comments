# Exact initial dependency audit and next triage

Checkpoint: 2026-10-05. Exact npm audit data is preserved in `evidence/dependency-audit.json`; full resolved paths are in `evidence/dependency-tree-all.json`. That npm tree command exits 1 because the initial `ws` placement is invalid. No blind upgrade or audit fix was run.

Counts are affected-package entries, including aggregate propagation: **16 total, 3 critical, 8 high, 5 moderate**. Individual advisory identifiers are enumerated below. The installed top-level Waline package is 1.43.4 and its core is 0.1.0.

## Reachability status

- **Observed:** the inert public entrypoint loads no dependency/model. The isolated candidate runs the real Waline HTTP path with an explicit in-memory model; tests observed zero external fetches and zero nodemailer transport creations for tested list/create/reply operations. No exploitation or real database test was performed
- **Static/config evidence:** custom-model selection avoids selecting Cloudbase/Leancloud storage in tested controller calls; `audit:true` avoids the normal spam-check branch and `AKISMET_KEY=false` disables its client. This supports non-use in those tested operations, not a general unreachable/security assertion
- **Still potentially loaded:** upstream loader loads service modules; `storage/cloudbase.js` invokes `cloudbase.init` and `app.database()` at module scope, while Leancloud is required at module scope. Package import is therefore not the same as selected storage or attacker reachability
- **Unknown:** whether each vulnerable function can be reached by malformed inputs or the eventual PostgreSQL/admin path. All affected dependency branches require targeted static tracing and isolated regression/compatibility checks before an exclusion or mitigation claim

## Small next task, not a platform rewrite

1. Fix and revalidate the `ws@5.2.7` lock inconsistency; preserve exact reproducible package integrity metadata
2. Trace the three legacy branches below: Cloudbase (axios/lodash), Leancloud realtime (protobufjs/uuid), and Akismet (request/form-data/qs/tough-cookie). Check actual load and input-call paths, then prefer bounded compatible fixes with contract tests. A major-version override alone is not proof of compatibility
3. Harden/test parser and logic error paths ahead of the current plugin, then repeat privacy/registration/no-mail regressions, clean install and audit on the resulting lock
4. Record remaining advisories with explicit reachable/unreachable/unresolved evidence; do not turn the currently disabled backend into approval to accept unresolved high-risk code

## Package entries and exact advisory IDs

### @cloudbase/database — high

Audit range: `0.9.0 - 0.9.21 || 1.0.0-beta - 1.4.3`

- Chain: `@waline/vercel@1.43.4` → `@cloudbase/node-sdk@3.18.3` → `@cloudbase/database@1.4.3`
- Installed paths: `node_modules/@cloudbase/database`
- Aggregate finding via `lodash.set`; see its exact advisories above/below
- Aggregate finding via `lodash.unset`; see its exact advisories above/below
- Reachability: **unresolved per advisory**; branch observations above are not exploitation proof

### @cloudbase/node-sdk — high

Audit range: `<=1.1.0 || >=2.0.0-beta`

- Chain: `@waline/vercel@1.43.4` → `@cloudbase/node-sdk@3.18.3`
- Installed paths: `node_modules/@cloudbase/node-sdk`
- Aggregate finding via `@cloudbase/database`; see its exact advisories above/below
- Aggregate finding via `axios`; see its exact advisories above/below
- Reachability: **unresolved per advisory**; branch observations above are not exploitation proof

### @waline/vercel — high

Audit range: `*`

- Chain: `@waline/vercel@1.43.4`
- Installed paths: `node_modules/@waline/vercel`
- Aggregate finding via `@cloudbase/node-sdk`; see its exact advisories above/below
- Aggregate finding via `akismet`; see its exact advisories above/below
- Aggregate finding via `leancloud-storage`; see its exact advisories above/below
- Reachability: **unresolved per advisory**; branch observations above are not exploitation proof

### akismet — moderate

Audit range: `>=1.0.0`

- Chain: `@waline/vercel@1.43.4` → `akismet@2.0.7`
- Installed paths: `node_modules/akismet`
- Aggregate finding via `request`; see its exact advisories above/below
- Reachability: **unresolved per advisory**; branch observations above are not exploitation proof

### axios — high

Audit range: `<=0.33.0`

- Chain: `@waline/vercel@1.43.4` → `@cloudbase/node-sdk@3.18.3` → `axios@0.27.2`
- Installed paths: `node_modules/axios`
- [GHSA-wf5p-g6vw-rhxx](https://github.com/advisories/GHSA-wf5p-g6vw-rhxx) · npm source 1097679 · Axios Cross-Site Request Forgery Vulnerability · affected `>=0.8.1 <0.28.0`
- [GHSA-jr5f-v2jv-69x6](https://github.com/advisories/GHSA-jr5f-v2jv-69x6) · npm source 1111034 · axios Requests Vulnerable To Possible SSRF and Credential Leakage via Absolute URL · affected `<0.30.0`
- [GHSA-3p68-rc4w-qgx5](https://github.com/advisories/GHSA-3p68-rc4w-qgx5) · npm source 1116672 · Axios has a NO_PROXY Hostname Normalization Bypass that Leads to SSRF · affected `<0.31.0`
- [GHSA-w9j2-pvgh-6h63](https://github.com/advisories/GHSA-w9j2-pvgh-6h63) · npm source 1117573 · Axios: Authentication Bypass via Prototype Pollution Gadget in `validateStatus` Merge Strategy · affected `<=0.31.0`
- [GHSA-pmwg-cvhr-8vh7](https://github.com/advisories/GHSA-pmwg-cvhr-8vh7) · npm source 1117575 · Axios: Incomplete Fix for CVE-2025-62718 — NO_PROXY Protection Bypassed via RFC 1122 Loopback Subnet (127.0.0.0/8) in Axios 1.15.0 · affected `<=0.31.0`
- [GHSA-xhjh-pmcv-23jw](https://github.com/advisories/GHSA-xhjh-pmcv-23jw) · npm source 1117579 · Axios: Null Byte Injection via Reverse-Encoding in AxiosURLSearchParams · affected `<=0.31.0`
- [GHSA-m7pr-hjqh-92cm](https://github.com/advisories/GHSA-m7pr-hjqh-92cm) · npm source 1117582 · Axios: no_proxy bypass via IP alias allows SSRF · affected `<=0.31.0`
- [GHSA-5c9x-8gcm-mpgx](https://github.com/advisories/GHSA-5c9x-8gcm-mpgx) · npm source 1117586 · Axios' HTTP adapter-streamed uploads bypass maxBodyLength when maxRedirects: 0 · affected `<=0.31.0`
- [GHSA-vf2m-468p-8v99](https://github.com/advisories/GHSA-vf2m-468p-8v99) · npm source 1117588 · Axios: HTTP adapter streamed responses bypass maxContentLength · affected `<=0.31.0`
- [GHSA-pf86-5x62-jrwf](https://github.com/advisories/GHSA-pf86-5x62-jrwf) · npm source 1117590 · Axios: Prototype Pollution Gadgets - Response Tampering, Data Exfiltration, and Request Hijacking · affected `<=0.31.0`
- [GHSA-6chq-wfr3-2hj9](https://github.com/advisories/GHSA-6chq-wfr3-2hj9) · npm source 1117592 · Axios: Header Injection via Prototype Pollution · affected `<=0.31.0`
- [GHSA-xx6v-rp6x-q39c](https://github.com/advisories/GHSA-xx6v-rp6x-q39c) · npm source 1117594 · Axios: XSRF Token Cross-Origin Leakage via Prototype Pollution Gadget in `withXSRFToken` Boolean Coercion · affected `<=0.31.0`
- [GHSA-43fc-jf86-j433](https://github.com/advisories/GHSA-43fc-jf86-j433) · npm source 1117857 · Axios is Vulnerable to Denial of Service via __proto__ Key in mergeConfig · affected `<=0.30.2`
- [GHSA-fvcv-3m26-pcqx](https://github.com/advisories/GHSA-fvcv-3m26-pcqx) · npm source 1119403 · Axios has Unrestricted Cloud Metadata Exfiltration via Header Injection Chain · affected `<0.31.0`
- [GHSA-62hf-57xw-28j9](https://github.com/advisories/GHSA-62hf-57xw-28j9) · npm source 1120124 · Axios: unbounded recursion in toFormData causes DoS via deeply nested request data · affected `<=0.31.0`
- [GHSA-hfxv-24rg-xrqf](https://github.com/advisories/GHSA-hfxv-24rg-xrqf) · npm source 1120546 · Axios: Regular Expression Denial of Service (ReDoS) via Cookie Name Injection · affected `<=0.31.1`
- [GHSA-p92q-9vqr-4j8v](https://github.com/advisories/GHSA-p92q-9vqr-4j8v) · npm source 1120644 · Axios: Proxy-Authorization Credential Leak to Origin Server Across HTTP-to-HTTPS Redirect in Axios Node.js HTTP Adapter · affected `<=0.31.1`
- [GHSA-j5f8-grm9-p9fc](https://github.com/advisories/GHSA-j5f8-grm9-p9fc) · npm source 1120646 · Axios: Proxy-Authorization header leaks to redirect target when proxy is re-evaluated to direct connection · affected `<=0.31.1`
- [GHSA-3g43-6gmg-66jw](https://github.com/advisories/GHSA-3g43-6gmg-66jw) · npm source 1120648 · axios Vulnerable to Credential Theft and Response Hijacking via Prototype Pollution Gadget in Config Merge · affected `>=0.19.0 <0.31.1`
- [GHSA-898c-q2cr-xwhg](https://github.com/advisories/GHSA-898c-q2cr-xwhg) · npm source 1120651 · axios has DoS & Header Injection via Prototype Pollution Read-Side Gadgets in axios merge functions · affected `<=0.31.1`
- [GHSA-pjwm-pj3p-43mv](https://github.com/advisories/GHSA-pjwm-pj3p-43mv) · npm source 1123825 · axios's shouldBypassProxy does not recognize IPv4-mapped IPv6 addresses, allowing NO_PROXY bypass (incomplete fix for CVE-2025-62718) · affected `<=0.31.1`
- [GHSA-mmx7-hfxf-jppx](https://github.com/advisories/GHSA-mmx7-hfxf-jppx) · npm source 1147948 · Axios: Prototype pollution gadgets can alter axios request construction · affected `<0.33.0`
- [GHSA-7q8q-rj6j-mhjq](https://github.com/advisories/GHSA-7q8q-rj6j-mhjq) · npm source 1153181 · Axios: Nested axios option objects can consume polluted prototype values · affected `>=0.8.0 <0.33.0`
- [GHSA-9fr6-4gfg-395g](https://github.com/advisories/GHSA-9fr6-4gfg-395g) · npm source 1240602 · Axios: Prototype-Pollution Gadget in the Default Instance Allows Inherited Object.prototype.method to Override HTTP Method · affected `>=0.27.2 <0.34.0`
- Reachability: **unresolved per advisory**; branch observations above are not exploitation proof

### form-data — critical

Audit range: `<=2.5.5`

- Chain: `@waline/vercel@1.43.4` → `@cloudbase/node-sdk@3.18.3` → `axios@0.27.2` → `form-data@4.0.6`
- Chain: `@waline/vercel@1.43.4` → `@cloudbase/node-sdk@3.18.3` → `form-data@4.0.6`
- Chain: `@waline/vercel@1.43.4` → `akismet@2.0.7` → `request@2.88.2` → `form-data@2.3.3`
- Chain: `@waline/vercel@1.43.4` → `form-data@4.0.6`
- Chain: `@waline/vercel@1.43.4` → `leancloud-storage@4.15.2` → `@leancloud/platform-adapters-browser@1.5.3` → `@leancloud/adapters-superagent@1.4.3` → `superagent@5.3.1` → `form-data@3.0.5`
- Chain: `@waline/vercel@1.43.4` → `leancloud-storage@4.15.2` → `@leancloud/platform-adapters-node@1.6.0` → `superagent@8.1.2` → `form-data@4.0.6`
- Installed paths: `node_modules/request/node_modules/form-data`
- [GHSA-fjxv-7rqg-78g4](https://github.com/advisories/GHSA-fjxv-7rqg-78g4) · npm source 1109540 · form-data uses unsafe random function in form-data for choosing boundary · affected `<2.5.4`
- [GHSA-hmw2-7cc7-3qxx](https://github.com/advisories/GHSA-hmw2-7cc7-3qxx) · npm source 1120745 · form-data: CRLF injection in form-data via unescaped multipart field names and filenames · affected `<2.5.6`
- Reachability: **unresolved per advisory**; branch observations above are not exploitation proof

### leancloud-realtime — high

Audit range: `>=3.0.0-beta.1`

- Chain: `@waline/vercel@1.43.4` → `leancloud-storage@4.15.2` → `leancloud-realtime-plugin-live-query@1.2.0` → `leancloud-realtime@5.0.0-rc.8`
- Chain: `@waline/vercel@1.43.4` → `leancloud-storage@4.15.2` → `leancloud-realtime@5.0.0-rc.8`
- Installed paths: `node_modules/leancloud-realtime`
- Aggregate finding via `protobufjs`; see its exact advisories above/below
- Aggregate finding via `uuid`; see its exact advisories above/below
- Reachability: **unresolved per advisory**; branch observations above are not exploitation proof

### leancloud-realtime-plugin-live-query — high

Audit range: `*`

- Chain: `@waline/vercel@1.43.4` → `leancloud-storage@4.15.2` → `leancloud-realtime-plugin-live-query@1.2.0`
- Installed paths: `node_modules/leancloud-realtime-plugin-live-query`
- Aggregate finding via `leancloud-realtime`; see its exact advisories above/below
- Reachability: **unresolved per advisory**; branch observations above are not exploitation proof

### leancloud-storage — high

Audit range: `>=3.0.0-beta.0`

- Chain: `@waline/vercel@1.43.4` → `leancloud-storage@4.15.2`
- Installed paths: `node_modules/leancloud-storage`
- Aggregate finding via `leancloud-realtime`; see its exact advisories above/below
- Aggregate finding via `leancloud-realtime-plugin-live-query`; see its exact advisories above/below
- Aggregate finding via `uuid`; see its exact advisories above/below
- Reachability: **unresolved per advisory**; branch observations above are not exploitation proof

### lodash.set — high

Audit range: `*`

- Chain: `@waline/vercel@1.43.4` → `@cloudbase/node-sdk@3.18.3` → `@cloudbase/database@1.4.3` → `lodash.set@4.3.2`
- Installed paths: `node_modules/lodash.set`
- [GHSA-p6mc-m468-83gw](https://github.com/advisories/GHSA-p6mc-m468-83gw) · npm source 1106906 · Prototype Pollution in lodash · affected `>=3.7.0 <=4.3.2`
- Reachability: **unresolved per advisory**; branch observations above are not exploitation proof

### lodash.unset — moderate

Audit range: `<=4.5.2`

- Chain: `@waline/vercel@1.43.4` → `@cloudbase/node-sdk@3.18.3` → `@cloudbase/database@1.4.3` → `lodash.unset@4.5.2`
- Installed paths: `node_modules/lodash.unset`
- [GHSA-f23m-r3pf-42rh](https://github.com/advisories/GHSA-f23m-r3pf-42rh) · npm source 1115807 · lodash vulnerable to Prototype Pollution via array path bypass in `_.unset` and `_.omit` · affected `>=4.0.0 <4.18.0`
- [GHSA-xxjr-mmjv-4gpg](https://github.com/advisories/GHSA-xxjr-mmjv-4gpg) · npm source 1120369 · Lodash has Prototype Pollution Vulnerability in `_.unset` and `_.omit` functions · affected `>=4.0.0 <=4.5.2`
- Reachability: **unresolved per advisory**; branch observations above are not exploitation proof

### protobufjs — critical

Audit range: `<=7.6.2`

- Chain: `@waline/vercel@1.43.4` → `leancloud-storage@4.15.2` → `leancloud-realtime@5.0.0-rc.8` → `protobufjs@5.0.3`
- Installed paths: `node_modules/protobufjs`
- [GHSA-xq3m-2v4x-88gg](https://github.com/advisories/GHSA-xq3m-2v4x-88gg) · npm source 1117571 · Arbitrary code execution in protobufjs · affected `<7.5.5`
- [GHSA-66ff-xgx4-vchm](https://github.com/advisories/GHSA-66ff-xgx4-vchm) · npm source 1118641 · protobuf.js: Code injection through bytes field defaults in generated toObject code · affected `<=7.5.5`
- [GHSA-2pr8-phx7-x9h3](https://github.com/advisories/GHSA-2pr8-phx7-x9h3) · npm source 1118924 · protobuf.js: Denial of service from crafted field names in generated code · affected `<=7.5.5`
- [GHSA-fx83-v9x8-x52w](https://github.com/advisories/GHSA-fx83-v9x8-x52w) · npm source 1118926 · protobuf.js: Prototype injection in generated message constructors · affected `<=7.5.5`
- [GHSA-75px-5xx7-5xc7](https://github.com/advisories/GHSA-75px-5xx7-5xc7) · npm source 1118928 · protobuf.js: Code generation gadget after prototype pollution · affected `<=7.5.5`
- [GHSA-jvwf-75h9-cwgg](https://github.com/advisories/GHSA-jvwf-75h9-cwgg) · npm source 1118930 · protobuf.js: Process-wide denial of service through unsafe option paths · affected `<=7.5.5`
- [GHSA-685m-2w69-288q](https://github.com/advisories/GHSA-685m-2w69-288q) · npm source 1118932 · protobuf.js: Denial of service through unbounded protobuf recursion · affected `<=7.5.5`
- [GHSA-q6x5-8v7m-xcrf](https://github.com/advisories/GHSA-q6x5-8v7m-xcrf) · npm source 1118935 · protobufjs has overlong UTF-8 decoding · affected `<=7.5.5`
- [GHSA-jggg-4jg4-v7c6](https://github.com/advisories/GHSA-jggg-4jg4-v7c6) · npm source 1119378 · protobufjs: Denial of Service via unbounded recursive JSON descriptor expansion · affected `<=7.5.7`
- [GHSA-wcpc-wj8m-hjx6](https://github.com/advisories/GHSA-wcpc-wj8m-hjx6) · npm source 1123488 · protobufjs: Denial of service through unbounded Any expansion during JSON conversion · affected `<=7.6.0`
- [GHSA-f38q-mgvj-vph7](https://github.com/advisories/GHSA-f38q-mgvj-vph7) · npm source 1123492 · protobufjs : Schema-derived names can shadow runtime-significant properties · affected `<=7.6.2`
- Reachability: **unresolved per advisory**; branch observations above are not exploitation proof

### qs — moderate

Audit range: `<=6.15.3`

- Chain: `@waline/vercel@1.43.4` → `@cloudbase/node-sdk@3.18.3` → `@cloudbase/signature-nodejs@2.2.0` → `url@0.11.4` → `qs@6.16.0`
- Chain: `@waline/vercel@1.43.4` → `akismet@2.0.7` → `request@2.88.2` → `qs@6.5.5`
- Chain: `@waline/vercel@1.43.4` → `leancloud-storage@4.15.2` → `@leancloud/platform-adapters-browser@1.5.3` → `@leancloud/adapters-superagent@1.4.3` → `superagent@5.3.1` → `qs@6.16.0`
- Chain: `@waline/vercel@1.43.4` → `leancloud-storage@4.15.2` → `@leancloud/platform-adapters-node@1.6.0` → `superagent@8.1.2` → `formidable@2.1.5` → `qs@6.16.0`
- Chain: `@waline/vercel@1.43.4` → `leancloud-storage@4.15.2` → `@leancloud/platform-adapters-node@1.6.0` → `superagent@8.1.2` → `qs@6.16.0`
- Installed paths: `node_modules/qs`
- [GHSA-6rw7-vpxm-498p](https://github.com/advisories/GHSA-6rw7-vpxm-498p) · npm source 1113719 · qs's arrayLimit bypass in its bracket notation allows DoS via memory exhaustion · affected `<6.14.1`
- [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g) · npm source 1158507 · qs: Denial of Service via Attacker Controlled isBuffer · affected `>=2.2.5 <6.16.0`
- Reachability: **unresolved per advisory**; branch observations above are not exploitation proof

### request — critical

Audit range: `*`

- Chain: `@waline/vercel@1.43.4` → `akismet@2.0.7` → `request@2.88.2`
- Installed paths: `node_modules/request`
- [GHSA-p8p7-x288-28g6](https://github.com/advisories/GHSA-p8p7-x288-28g6) · npm source 1096727 · Server-Side Request Forgery in Request · affected `<=2.88.2`
- Aggregate finding via `form-data`; see its exact advisories above/below
- Aggregate finding via `qs`; see its exact advisories above/below
- Aggregate finding via `tough-cookie`; see its exact advisories above/below
- Aggregate finding via `uuid`; see its exact advisories above/below
- Reachability: **unresolved per advisory**; branch observations above are not exploitation proof

### tough-cookie — moderate

Audit range: `<4.1.3`

- Chain: `@waline/vercel@1.43.4` → `akismet@2.0.7` → `request@2.88.2` → `tough-cookie@2.5.0`
- Chain: `@waline/vercel@1.43.4` → `jsdom@30.1.2` → `tough-cookie@6.0.2`
- Installed paths: `node_modules/request/node_modules/tough-cookie`
- [GHSA-72xf-g2v4-qvf3](https://github.com/advisories/GHSA-72xf-g2v4-qvf3) · npm source 1097682 · tough-cookie Prototype Pollution vulnerability · affected `<4.1.3`
- Reachability: **unresolved per advisory**; branch observations above are not exploitation proof

### uuid — moderate

Audit range: `<11.1.1`

- Chain: `@waline/vercel@1.43.4` → `akismet@2.0.7` → `request@2.88.2` → `uuid@3.4.0`
- Chain: `@waline/vercel@1.43.4` → `leancloud-storage@4.15.2` → `leancloud-realtime@5.0.0-rc.8` → `uuid@3.4.0`
- Chain: `@waline/vercel@1.43.4` → `leancloud-storage@4.15.2` → `uuid@3.4.0`
- Installed paths: `node_modules/uuid`
- [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) · npm source 1119441 · uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided · affected `<11.1.1`
- Reachability: **unresolved per advisory**; branch observations above are not exploitation proof
