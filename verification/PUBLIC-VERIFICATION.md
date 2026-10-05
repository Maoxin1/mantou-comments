# Public source snapshot verification

Snapshot: 2026-10-05. Approved target: `Maoxin1/mantou-comments`; tag
`source-2026-10-05`. Publication is a separate step.

- Fresh offline application verification passed all 37 tests (33 application,
  four historical reference regressions) with lifecycle scripts disabled
- Node 24.19.0 / npm 11.9.0; fresh dedicated cache seeded from all 488 verified archives
- All 10 original test/helper source files and all 608 compressed archives remain
  byte-identical to the verified input source bundle
- All four portable preferred-source Python scripts compile; authored absolute
  workspace paths and historical process-ownership wording were removed
- Preserved prior evidence: four exact core outputs with Node 24.20.0; exact
  upstream server archive; zero known application advisories in the 2026-10-05
  audit snapshot. These checks were not represented as new runs

`public-release-verification.json` lists exact scope, changed files and
source hashes. `public-application-verify.log` records the fresh test replay.
`SOURCE-MANIFEST.json` at the bundle root covers every file except itself; the
root `SHA256SUMS` covers payload files except itself and that manifest.

Limits remain: unavailable MathJax font-generation inputs/tools; no independent
KaTeX font or Undici WASM regeneration; no real database, administrator,
persistence/moderation acceptance or production deployment. The entrypoint
continues to return 503. This prerelease is source evidence, not production
acceptance or a universal legal/security guarantee.
