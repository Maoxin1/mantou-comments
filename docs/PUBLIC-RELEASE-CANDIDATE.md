# Public comments release candidate — 2026-10-07

This source is a local candidate, not evidence of a public deployment. The
default `index.cjs` remains disabled. Select `deployment/public-comments.cjs`
only with its reviewed `deployment/public-comments.vercel.json` packaging.

The release exposes only `/api/comment` for guest reads and submissions. The
exact browser origin is `https://mantou-blog.pages.dev`; preflight accepts only
GET/POST with Content-Type, never credentials or wildcard origins. Both formal
Vercel aliases and the current generated deployment host are matched exactly.
Submitted roots and replies always enter `waiting`; only approved comments
are public. Nickname is required, email is optional and excluded from public
responses. No registration, account, setup, reaction, counter or notification
route is exposed. The reader uses the previously accepted Waline core and
PostgreSQL adapter with strict TLS; no schema initialization is added.

Private administration is available only on the exact generated deployment
host, which must retain Vercel Standard Protection without bypasses. Both formal
aliases reject private routes. The existing owner key, administrator password,
CSRF validation and absolute PRIVATE_ADMIN_EXPIRES_AT remain required. Setup is
disabled even for an authenticated administrator. The deadline is not extended;
after it expires the private page closes while public comments remain pending
and public approved reads continue. Reopening moderation requires a separately
authorized owner-controlled configuration and deployment session.

`config/published-threads.json` contains canonical paths extracted from the
matched Hugo production build (209 discussions, 418 language pages at this
checkpoint). A new article or work requires refreshing this registry and the
backend before enabling comments on its page; editing existing text does not.
The strict registry avoids storing arbitrary invented discussion paths. CORS
does not prevent non-browser spam, and this candidate adds no distributed rate
limiter or external anti-spam service. Review traffic/quotas before launch.

Publish corresponding source and preserved notices before public enablement.
All bundled dependency versions and the package lock are unchanged. The earlier
protected real acceptance covered four actual guest comments and four approvals;
new release checks use local synthetic data. A public-domain browser verification
after authorized promotion remains required. Local tests cannot establish
production routing, TLS, deployment protection, or live cross-origin behavior.

Official references checked 2026-10-07:
- https://vercel.com/docs/deployment-protection
- https://vercel.com/docs/cli/deploy

Use `--prod --skip-domain` for staging; promotion is a separate authorization.
Never disable project protection globally to make a staged cross-origin request
work. Do not create share links, bypass tokens or OPTIONS exceptions.
