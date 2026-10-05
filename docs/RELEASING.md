# Releasing the source snapshot

Approved destination: public repository `Maoxin1/mantou-comments`. Snapshot tag:
`source-2026-10-05`. Release title: `Source and notice snapshot · 2026-10-05`.
Mark it as a prerelease because production service acceptance remains open.

1. Review the checkout manifest and complete asset provenance; preserve all
   third-party archive bytes and notices
2. Publish the checked source tree and point the tag to that exact commit
3. Attach the complete source-and-notice ZIP, its `SHA256SUMS`, and the public
   verification summary. Do not substitute GitHub's automatic checkout archive
4. Download the Release ZIP anonymously, verify SHA-256, and check the manifest
   against all extracted files. Record the exact commit, tag and asset URL
5. Before any later service activation, verify a prominent free source link for
   the exact running backend and retain older released source versions

Creating the source repository/release does not enable the application. Do not
add CI workflows, service integrations, webhooks, secret grants, database setup or
deployment as part of this publication. Real PostgreSQL/administrator/moderation,
durability, privacy and the other acceptance gates require separate completion.

The generated package and build script retain their exact historical bytes;
`LICENSE-CHOICES.md` is the current source-release license decision.
