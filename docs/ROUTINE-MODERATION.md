# Routine moderation preparation — 2026-10-07

This change is submitted for draft-PR review and hosted validation. Deployment
requires separate authorization.
It does not change the existing protected host, owner key, administrator identity,
password, CSRF checks, short session or absolute private access deadline.

## Bounded workflow

- Waiting and Rejected / spam each show 20 items per page, with previous/next links
- Approval publishes a waiting item. Reject / mark as spam keeps it private
- Restore to waiting is reversible and does not publish. Approve separately after review
- There is no deletion, comment editing, published-comment management, direct
  administrator reply, notification or new public capability
- Navigation preserves the queue and page after an action and redirects a drained
  final page to a valid page. Page numbers are bounded to 1–10,000
- Counts and rows are separate reads; the list can change while other requests run

Writes match the exact comment id, prior status and prior discussion URL in one
conditional UPDATE through the installed query builder. A stale transition returns
409 without replacing the newer state. An uncertain write/commit returns 503 with
an instruction to reconcile by an authorized read-only check; never blindly retry.
The allowed transitions are waiting → approved, waiting → spam and spam → waiting.
This does not make forms single-use or detect a full waiting → spam → waiting cycle.

## Access decision still needed

The current absolute private window is unchanged, at most 24 hours. When it closes,
approved comments stay readable and readers can still submit waiting comments.

The smallest continuation is owner-authorized bounded reopening sessions with the
same controls. A durable owner-only moderation entry point could reduce repeated
configuration, but requires a separately reviewed access design, explicit approval
for persistent access, revocation/retired-deployment behavior and live acceptance.
Do not remove the deadline or disable deployment protection as a shortcut.

## Acceptance and release

1. Run npm run check, the entire application suite and all reference regressions
2. Test synthetic queues beyond 20 items, rejection/restore without publication,
   stale competing actions, malformed navigation and existing access boundaries
3. Inspect real rendered pages and form navigation with synthetic accounts only
4. After explicit publication/deployment approval, verify packaged runtime modules,
   exact deployed source, protected/private host separation and owner login
5. Real comment writes or moderation require their own authorized bounded scenario;
   local fake-driver and browser tests do not prove production durability

Production access, secrets, environment changes, reopening, merge and deployment
are outside this draft-PR preparation. Historical release/source notices remain intact.
