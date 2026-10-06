# Waline browser client

Vendored `dist/waline.js` and unmodified `dist/waline.css` from the official npm
package `@waline/client@3.15.2` (MIT; license included).

Source: https://github.com/walinejs/waline
Package: https://www.npmjs.com/package/@waline/client/v/3.15.2

The client is served from the blog origin and loaded only when a configured
feedback area is opened. Source maps and unrelated bundles are not shipped.

## Local submit-lock patch (2026-10-05)

`waline.js` has site-local behavior patches, not an official upstream release:
acquire `isSubmitting` synchronously at the start of `submitComment`, before
`await userAgent()`, and release it in `finally`. Direct clicks and both keyboard
shortcuts then share the lock through preparation, validation, POST and completion.
Early validation returns and UA preparation errors release it; errors retain the
current draft. This is an in-page guard, not backend idempotency or cross-tab dedupe.
The pre-existing inner request scope is retained because its minified locals
shadow outer configuration refs.

A nonzero response error code is also treated as an error when its message is
missing or empty. A Chinese/English fallback keeps the draft and avoids reporting
success; this does not infer whether a real backend has persisted a record.

Preparation errors also handle null/undefined/string rejection values without
throwing from the error reporter; all paths retain the common finally unlock.

The GET comment/counter APIs reject a non-2xx HTTP response before trusting its
JSON errno. This does not change POST/unknown-write handling.

The exact seven substitutions are reviewable in `scripts/patch_waline_submit.cjs`.
To reproduce after replacing the bundle with the **original 3.15.2** artifact:

```sh
node scripts/patch_waline_submit.cjs
```

The script refuses any input other than original SHA-256
`e724ca392e46cea5a4b038a023607d15a01e1aae4693982a3684c18b932f47dc`.
`tests/node/waline-vendor-patch.test.cjs` checks that reversing the substitutions
recovers exactly that artifact and reapplying them reproduces the served bytes.
Review/rebase this patch explicitly on future upgrades; do not apply it blindly.

`tests/node/waline-submission.test.cjs` executes the actual compiled submit and
keyboard handlers with mock closure dependencies. The browser path is separately
covered by the TM-019 definition in `tests/e2e/reader-feedback.spec.js`; Node
component tests are not proof of real-browser or real-service behavior.
