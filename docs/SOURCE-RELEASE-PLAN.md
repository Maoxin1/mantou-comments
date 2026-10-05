# Approved complete-source route

The project owner approved open-source preparation of the combined backend and
original modifications on 2026-10-05. This supersedes earlier blanket requirements
to obtain maintainer clarification or qualified review before proceeding.

## Chosen route

- Preserve the published Waline GPLv2-or-later grant and use its GPLv3 option
- License original additions under AGPL-3.0-or-later, keeping third-party terms
- Preserve the UAParser AGPL grant and offer the complete combined backend source
  to remote users, using GPLv3 section 13's combination provision
- Select Apache-2.0 where DOMPurify offers that option; retain other component and
  font/asset grants, attribution and notices separately
- Include exact core TypeScript/build material, our wrapper/patches/generator,
  locked dependency artifacts and preferred-source supplements where available

This path does not depend on resolving the historical MIT metadata discrepancy.
A source homepage link or compiled dist files alone is not treated as complete
source. The preparation report must distinguish actual rebuilds from source
inventory evidence and explicitly identify unavailable build inputs.

## Source offer before activation

The approved repository and GitHub Release destination is
`Maoxin1/mantou-comments`. Publish a free, prominent download of the exact running backend's source and
notices. Link it visibly from the comment interface and service information page;
a header or obscure repository link alone is insufficient for this conservative
plan. Test anonymous access, archive checksums and version mapping. Retain source
for older running/distributed versions when releases change.

This archive prepares that approved destination; it does not assert completed
publication or verified anonymous access. No backend, database, CI integration,
webhook, or deployment is enabled. Production index.cjs remains inert.

## Verification

Use a fresh extracted bundle and fresh cache for application installation, tests,
pruning reproduction and source/build checks. Preserve the original 37 assertions
and current zero-advisory audit without deleting components merely to obtain a
completeness claim. Keep source/license limitations explicit, especially embedded
font generation. The report is evidence of bounded preparation, not a universal
legal compliance opinion or real-service acceptance result.
