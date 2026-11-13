# Mantou comments: source snapshot

## Current source status — 2026-11-13

This PostgreSQL-only Waline source tree keeps the default `index.cjs` entrypoint
disabled (503). The optional public-comments profile is packaged separately;
see [release-profile behavior and boundaries](docs/PUBLIC-RELEASE-CANDIDATE.md).
The disabled default is a property of this checkout, not a claim that no service
has ever been deployed.

- Main includes the discussion-registry synchronization merged in [PR #2](https://github.com/Maoxin1/mantou-comments/pull/2).
- Earlier protected guest-comment acceptance and production-reader checks are historical evidence. Live routing, database access and moderation availability were not revalidated by this documentation update.
- [Draft PR #3](https://github.com/Maoxin1/mantou-comments/pull/3) adds paginated reversible moderation and validation CI. Its branch has passing automated checks; browser rendering and real PostgreSQL persistence remain pending. These changes are not on main.
- [Earlier README status checkpoints](docs/history/readme-status-before-20261113.md) retain the 51/56-test diagnostic stages. Other dated checkpoints below also describe their own revisions, not today's test count or security status.

Source provenance, corresponding-source assets, notices and license choices
remain part of this repository. Changes to source documentation do not enable a
deployment profile, extend private-administration access or change the database.

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

## Diagnostic classification checkpoint (2026-10-05)

The phase-classification update passed a fresh offline install and all 65 tests (61 application + 4 reference). The nine additive regressions failed against the published prior runtime before the fix. Existing test/helper files, dependency lock, timeouts, verified TLS and fixed read-only SQL are unchanged. See [the classification report](docs/DIAGNOSTIC-PHASE-CLASSIFICATION.md). This is not a real database acceptance pass; the latest live result remains connection_failed with unconfirmed transport.

## Same-endpoint direct diagnostic candidate (2026-10-05)

The diagnostic can use the existing PGHOST_UNPOOLED only when it exactly matches the configured pooled endpoint with its -pooler suffix removed; missing/mismatched identity fails closed. Strict TLS, read-only startup/SQL and timeouts stay intact. All 70 tests pass, but the live root cause remains unconfirmed. See [evidence and interpretation](docs/DIRECT-DIAGNOSTIC-CANDIDATE.md).


## Private setup and login preparation (2026-10-06)

The optional owner-gated setup/login page and real PostgreSQL adapter wiring pass a fresh offline install and all 135 local tests (131 application plus four reference). The public entrypoint stays disabled. Tests use synthetic accounts and fake pg transport; no real administrator creation or deployed login acceptance is claimed. See [the implementation and release gates](docs/PRIVATE-ADMIN-PAGE-RESULT.md). The optional profile requires NODEJS_HELPERS=0 during both build and runtime, separately provisioned owner/session secrets, an absolute private window, and owner-controlled credential entry. Existing dependency sources and licenses remain unchanged.
