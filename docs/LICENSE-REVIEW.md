# Licensing evidence and release hold

**Current source-release update:** the owner approved the full-source GPLv3/AGPL route on 2026-10-05. See SOURCE-RELEASE-PLAN.md and LICENSE-CHOICES.md. Earlier blanket clarification/review gates below are historical; current blockers are source/notice completeness, a verified public source offer at an authorized destination, and real-service acceptance. Public repository and Release ZIP publication are approved for `Maoxin1/mantou-comments`; publication verification remains a release step. Deployment and database activation are outside this approval.

Historical local review scope, 2026-10-05: a private PostgreSQL-only derivative before the complete-source publication route was approved. No deployment was performed by that review.

## Exact upstream conflict

Official [registry metadata](https://registry.npmjs.org/@waline%2fvercel/1.43.4), the published server manifest, and its bundled core manifest say MIT. Both published LICENSE files instead contain GPL version 2 and the Waline-specific lizheming 2020–2021 notice permitting GPL v2 or later.

This is reproduced at source commit `c4b0f1ebb9a7970d36493d4c3580f3f43e098fa5`:

- [Server manifest](https://github.com/walinejs/waline/blob/c4b0f1ebb9a7970d36493d4c3580f3f43e098fa5/packages/server/package.json)
- [Root license](https://github.com/walinejs/waline/blob/c4b0f1ebb9a7970d36493d4c3580f3f43e098fa5/LICENSE)
- [Release script](https://github.com/walinejs/waline/blob/c4b0f1ebb9a7970d36493d4c3580f3f43e098fa5/scripts/publish-server.js), which explicitly copies that root license into the server and bundled core

The evidence does not establish whether MIT was intended as an alternative grant or is stale metadata. The derivative therefore identifies its license as `SEE LICENSE IN LICENSE`, preserves both full license files byte-for-byte, retains both original manifests, and documents the conflict. It does not claim MIT-only licensing or resolved compatibility.

## Preserved provenance

- Source archive: `vendor/upstream/waline-vercel-1.43.4.tgz`
- Official archive SHA-256: `d719b6592178d0ad6f93a803def4b93cbb27fa812b6742dc32f732abed788a7c`
- Official archive SHA-512/integrity: stored in `vendor/derivation-manifest.json` and verified before every generation
- Both original LICENSE files: 18,040 bytes, SHA-256 `010728bac3f86aa3c028f766a28f4ec2da4289335571dc9756e5a7d595de59bc`
- Original server manifest SHA-256: `e895c3deb6f4f113fbf81a2b4b1c546ffde774f6ec6799b64c8079cd157a1c5f`
- Original core manifest SHA-256: `3dccdba9a04625443f079060b197de7e1bb4330a00ad23f26fc29ccf31247838`
- Readable original notices/manifests are duplicated in `vendor/notices/`; the derived archive also retains both original LICENSE files
- [Registry provenance payload](https://registry.npmjs.org/-/npm/v1/attestations/@waline%2fvercel@1.43.4) identifies the release commit and release-server workflow. The payload was inspected and artifact digest matched; its cryptographic signature was not independently verified

The derived package has a distinct name/version, `private:true`, no publish configuration, dated modification notices, a full change manifest and a fail-closed direct entrypoint.

## What this permits us to conclude

The GNU project's [GPL FAQ on private modifications](https://www.gnu.org/licenses/gpl-faq.html.en#GPLRequireSourcePostedPublic) distinguishes private use from distribution and does not require privately modified code to be published merely because it was modified. That supports continuing this private local preparation; it is not a legal determination of the conflicting upstream grants.

If distributing under the bundled GPL grant, review at least: retained notices/license text, dated modification notices, terms for the covered derivative, corresponding source for executable/generated artifacts, and compatibility of combined dependencies. Bundled core is generated `dist` code, so retaining only its compiled files and a source link is not by itself proof that all corresponding-source obligations are satisfied.

## Additional retained dependency issue

The installed `ua-parser-js@2.0.10` declares `AGPL-3.0-or-later`. Its AGPL license remains in the installation; source LICENSE.md SHA-256 is `677a9f8c04196ea6cea9a1da75b9e3923d3e82c82de010d6081a163afdcefd76`. This needs network-use and combined-work review before deployment. An npm audit with zero known security advisories does not resolve licensing.

## Release gate and smallest next step

Obtain upstream clarification or qualified review establishing the applicable Waline/core license, then assess the final retained dependency licenses and intended distribution/deployment method. No upstream contact has been sent. Until that review is resolved, keep this derived package private and the public entrypoint disabled. Do not publish or deploy merely because installation, tests or security audit pass.
