# Mantou comments: source snapshot

Latest diagnostic preparation: 51 local tests pass (47 application/diagnostic and four unchanged reference regressions), with a fresh offline installation and zero known audit findings at the earlier 47-test checkpoint. Both default entrypoints remain disabled. A separate staged read-only diagnostic adapter is available only for an explicitly reviewed protected deployment; it is not database or production acceptance. See [diagnostic scope and limits](docs/POSTGRESQL-DIAGNOSTIC.md).

A disabled-by-default, PostgreSQL-only Waline backend candidate, with security
boundaries, deterministic derivation, original tests, license choices and
source-provenance evidence. Approved public target: `Maoxin1/mantou-comments`.

This is a **source prerelease**, not a live comment service. `index.cjs` returns
503. No database, administrator, service integration or deployment is enabled.

## Start here

- [Development and tests](docs/DEVELOPMENT.md)
- [Current license choices](LICENSE-CHOICES.md), [AGPLv3](COPYING.AGPL3), [GPLv3](COPYING.GPL3)
- [Source release plan](docs/SOURCE-RELEASE-PLAN.md) and [remaining acceptance gates](docs/REMAINING-GATES.md)
- [Full bundle/build documentation](docs/COMPLETE-SOURCE-BUNDLE.md)
- [Verification scope](verification/PUBLIC-VERIFICATION.md)

## Full source and notice asset

The complete source archive for tag `source-2026-10-05` is:

- File: `mantou-waline-public-source-and-notices-20261005.zip`
- Size: 235,827,289 bytes
- SHA-256: `e601e2130eaae771ac9e358f07109f87b64046acada7f6626bbbd17f880be382`

Use the matching GitHub Release asset, rather than GitHub's automatically
generated source ZIP, for the complete offline source/notice collection. This
checkout deliberately leaves large pinned source, registry and build-tool
archives in that Release asset. It keeps their manifests, exact provenance,
original project code, build recipes, selected notices and the two small
application package inputs. Publication/anonymous-access checks are recorded by
the release process, not asserted merely by this README.

The asset includes the pinned upstream Waline repository, 488 exact registry
archives, 69 preferred-source archives, original and restored notices, and
locked core-build tools. Its full manifest covers every bundled file. Checkout
`SOURCE-MANIFEST.json` and `SHA256SUMS` describe this smaller tree; files under
`provenance/` identify the separate complete asset.

## Verified scope and limits

All 37 original assertions pass (33 application and four isolated historical
reference regressions). The publication pass rechecked them offline in a fresh
cache, with all 10 test/helper source files unchanged. Prior evidence records
four byte-exact core outputs, exact original server-package reconstruction, and
a 2026-10-05 application audit snapshot with zero known advisories.

MathJax font-generation inputs/tools are not available from a verified public
release. Original font assets and separate notices are preserved; KaTeX font and
Undici WASM regeneration were not run. These limits are detailed in
`third_party/preferred-source-and-notices/REPORT.md`. No universal security,
legal-compliance or production-readiness claim is made.

Earlier licensing-hold wording remains inside the byte-preserved derivative,
generator and provenance records. Current `LICENSE-CHOICES.md` and the approved
source-release plan supersede that historical status. Component grants are
retained; fonts/assets are not blanket-relicensed.
