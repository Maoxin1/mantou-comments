# README status checkpoints before 2026-11-13

These paragraphs preserve dated development states, not the current live service status. Current entry: [README](../../README.md). Relative links below are adjusted for this archive location.

# Mantou comments: source snapshot

Current local discussion-sync candidate: see [public release candidate](../PUBLIC-RELEASE-CANDIDATE.md). The first guest-comments release has completed protected acceptance and production reader verification. This candidate adds verified production-blog registry refresh; publication of this change is still pending owner approval. The default entrypoint remains disabled. Historical checkpoints below describe their own dates, not the latest live state.

Reporting update: 56 local tests pass. A separate protected HTML diagnostic report preserves explicit failure status instead of losing a 503 response to the browser error page. See [first-attempt evidence and reporting limits](../DIAGNOSTIC-REPORTING-FIX.md). This update does not establish database acceptance.

Latest diagnostic preparation: 51 local tests pass (47 application/diagnostic and four unchanged reference regressions), with a fresh offline installation and zero known audit findings at the earlier 47-test checkpoint. Both default entrypoints remain disabled. A separate staged read-only diagnostic adapter is available only for an explicitly reviewed protected deployment; it is not database or production acceptance. See [diagnostic scope and limits](../POSTGRESQL-DIAGNOSTIC.md).

A disabled-by-default, PostgreSQL-only Waline backend candidate, with security
boundaries, deterministic derivation, original tests, license choices and
source-provenance evidence. Approved public target: `Maoxin1/mantou-comments`.

This is a **source prerelease**, not a live comment service. `index.cjs` returns
503. No database, administrator, service integration or deployment is enabled.
