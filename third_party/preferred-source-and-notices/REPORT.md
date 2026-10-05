# Retained Waline backend dependency source and notice inventory

Reviewed 2026-10-05. Scope is the retained `waline-backend-prep/package-lock.json` application closure, not the retired reference SDK tree. This is a factual packaging/source inventory, not legal clearance or a conclusion that independently licensed fonts are incompatible with the application. Nothing was published, deployed, or sent to third parties.

## Result

- Inventoried all 286 installed lockfile dependency entries (268 unique name/version pairs), with registry integrity identifiers, package metadata, source-location indicators, and 283 installed notice-file hashes. See `dependency-inventory.json` and `inventory-summary.json`.
- Retrieved 69 immutable upstream source/release archives, about 79.9 MB, supplementing the runtime npm archives being prepared separately. These include generated-only dependency groups whose npm packages omit editable TypeScript, original JavaScript, or build scripts. Each archive has a commit URL and independently calculated SHA-256 in `SOURCE-ARCHIVES.json`.
- For 76 package mappings from the additional registry-source pass, an archive manifest with the exact installed package version was located. `source-package-mapping.json` records the package root, available source directories, and installed/upstream file overlaps. UAParser, MathJax-src, speech-rule-engine, xmlchars, llhttp, and publicsuffix have additional dedicated evidence.
- Restored notice material omitted from published npm packages, notably UAParser's full `THIRD_PARTY_NOTICES.md` and speech-rule-engine's `NOTICE`. `notices/` preserves installed notice files; `upstream-notices/` preserves supplementary archive notices without replacing the originals.
- Font assets have additional licenses beyond npm package metadata: MathJax NewCM WOFF2 assets identify GUST Font License; MathJax TeX and KaTeX fonts identify SIL OFL 1.1. Exact embedded notices, font hashes, and the applicable license texts are supplied.

This is an expanded source-and-notice preparation set, not evidence that every dependency or font can be rebuilt reproducibly. No dependency-source rebuilds were run in this workstream. Application build/test verification is documented separately in the enclosing bundle.

## Exact high-priority components

### ua-parser-js 2.0.10

- License: installed `LICENSE.md`, AGPL-3.0-or-later metadata. License SHA-256 `677a9f8c04196ea6cea9a1da75b9e3923d3e82c82de010d6081a163afdcefd76`.
- Both npm registry `gitHead` and GitHub tag `2.0.10` resolve to `4121c59060c3f9b814f07978c361e44016028c74`.
- Archive: `sources/ua-parser-js-4121c59060c3f9b814f07978c361e44016028c74.tar.gz`; SHA-256 `cae43cc8f7ac4a7673ce9ea8c9ae5047b7148259f458ea166986847c84b946f8`.
- All 211 installed package files that overlap the archive match byte-for-byte. See `upstream-overlap-verification.json`.
- The npm package contains the runtime preferred JS under `src/`, but only `script/cli.js`; its declared `script/build-dist.sh` and `script/build-esm.js`, test fixtures, development lock/configuration files, and full asset attribution file were omitted. The immutable archive supplies them.
- Preserve the full upstream third-party notice when retaining `dist/icons`: MIT browser logos (Cătălin Mariș), CC0 Simple Icons, and MIT CoreUI (creativeLabs Łukasz Holeczek). The installed small icon license stubs are not a substitute for the full MIT grants. Restored file hash: `6fddf6d21973290e51324a54b19bbada93a9025873985944da5bdacf89f2e191`.
- Source: https://github.com/faisalman/ua-parser-js/tree/4121c59060c3f9b814f07978c361e44016028c74

### @mathjax/src 4.1.3

- Apache-2.0; installed `LICENSE` SHA-256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`.
- GitHub tag `4.1.3` resolves to `fb987178c2d279a99b0db5ea02e751691703955e`. The npm version record does not contain gitHead; the tag resolution and source-byte comparison supply the connection.
- Archive SHA-256 `9fe7988432f3eba74b6bcb1e991c6ce496f0f361c15a8f4fbc7013a03f909a4b`.
- Unlike most generated-only dependencies, npm includes editable `ts/`, `components/`, and `tsconfig/`. Of 634 files overlapping the upstream archive, 633 match byte-for-byte. The one differing `package.json` is semantically identical after JSON parsing; only serialization differs.
- The upstream archive also supplies repository development/lock/configuration material omitted from npm. It does not supply MathJax's separately maintained font generation tools or original font inputs.
- Source: https://github.com/mathjax/MathJax-src/tree/fb987178c2d279a99b0db5ea02e751691703955e

### @mathjax/mathjax-newcm-font 4.1.3 and @mathjax/mathjax-tex-font 4.1.3

- Npm package-level metadata is Apache-2.0. Neither package has a standalone LICENSE or NOTICE file in this installation.
- Both exact npm registry records identify source repo `mathjax/MathJax-fonts` and `gitHead` `b3b77f655ed2d9009078301626e27b56dcfa90d9`. Repository contents and the exact commit archive return HTTP 404. The public npm `@mathjax/font-tools` endpoint also returns 404. These are retrieval observations, not a claim about why the source is unavailable.
- Npm includes one editable `def/*.ts` file per font package, generated JS/font tables, WOFF2 assets and tsconfig files. Definitions refer to `@mathjax/font-tools`, absent `fonts/*.otf` inputs, and (NewCM) absent `../subsets/MJX-Extra-Regular.otf`. Build commands also refer to absent `../bin/*` helpers and generated work directories. Therefore an npm archive is not a complete independent font-generation source tree.
- All 105 NewCM WOFF2 files were decoded and contain GUST Font License attribution to Antonis Tsolomitis; 21 also add MathJax 2024 copyright. All 22 TeX WOFF2 files name SIL OFL 1.1; two retain Design Science 2009–2010 notices with Reserved Font Name `MathJax_Main`.
- `font-metadata.json` records each asset SHA-256 and complete relevant name-table records. `FONT-NOTICES.md` maps the groups. GUST Font License 1.0 and referenced LPPL 1.3c are preserved along with OFL 1.1 and Apache-2.0 text.
- The official documentation says font-generation tools used to build these packages are not yet ready for public release. Snapshot: `mathjax-fonts-official-docs.rst`, upstream file blob `6dc8d26dde041b44b248b7a2ac074a1be4690e93`. Source: https://docs.mathjax.org/en/latest/output/fonts.html#the-mathjax-font-tools
- Bounded gap: exact original font inputs, font-tools, and helper scripts cannot presently be supplied from a verified public release. Preserve actual assets and separate font licenses; do not represent them as blanket GPL/AGPL relicensing or claim font-generation reproducibility. This is not by itself a finding of a prohibited combination. The GUST/LPPL text expressly treats unrelated aggregation separately, and OFL permits bundling fonts with other software under its conditions.

### Other MathJax source dependencies

- `speech-rule-engine@5.0.0-rc.4`: exact tag resolves to `d60c0650509e1dd9db004d22b077d05b63507657` in `Speech-Rule-Engine/speech-rule-engine`. Archive SHA-256 `b99689f5617670bf276fb06a5620f89581fca81d107e1b01adc9e44ad6c5570f`. Npm omits editable `ts/`, source mathmaps and build configuration. Archive includes those. The installed manifest is semantically identical to the tag manifest. Upstream `NOTICE` is absent from npm and restored with hash `e75e81a077c1ad1e03daa4fa336b8bd66dd9847fa17679f5bd2ae13734132cbc`; it credits Volker Sorge, original ChromeVox/Google context and wicked-good-xpath.
- `mj-context-menu@1.0.0`: npm registry gitHead `2156b7db7cac02ca8451deb4ee6075d55b591d37`; source archived from `zorkow/context-menu` via its public redirect. Npm contains compiled JS/declarations; source supplies TypeScript/build configuration. Exact archive details in `SOURCE-ARCHIVES.json`.
- `mhchemparser@4.2.1`: registry gitHead `2159346e2bb45ec6beaf64b617e0e5a049b4d200`, repo `mhchem/mhchemParser`. Npm already includes `src/` and TypeScript configurations; source archive supplies full upstream context.
- `wicked-good-xpath@1.3.0`: dist-only npm package supplemented with its registry-pinned upstream source; preserve its own Apache notice.

### Other generated-code and asset coverage

Immutable upstream sources were also retrieved for the retained @mdit plugins/helpers, @fast-csv packages/fast-csv, @csstools packages, dom-selector, specificity, bidi-js, DOMPurify, entities, ip2region, the three small UAParser helper dependencies, KaTeX, markdown-it/linkify-it/mdurl/uc.micro, parse5, saxes, tough-cookie, nodemailer, lru-cache/minipass/path-scurry/glob/minimatch/rimraf and related helpers, Nunjucks, think-model/think-trace, validator/xmlbuilder, PostgreSQL-related sources, tldts, source-map, and others. The machine-readable inventory is authoritative for exact versions, commits, archive hashes and per-package roots.

- KaTeX `0.18.10` maps to `411da7029f5c095943c2805ce6db16c2be5f214d`. Its archive contains editable application sources and font build scripts under `src/fonts` and `dockers/fonts`; font build inputs also depend on named TeX/OS packages in its Dockerfile. All 20 runtime TTF faces were decoded and identify SIL OFL 1.1, Design Science/Khan Academy copyright and reserved `KaTeX_*` names. See `katex-font-metadata.json`. Companion WOFF/WOFF2 bytes are preserved in npm artifacts; their metadata was not separately decoded in this pass. Font generation was not run.
- `tldts@7.4.16` / `tldts-core@7.4.16`: repo commit `b9519e00ba47ad557cc9fc0416ea0cf5f89a4a12` refers to a git submodule omitted by ordinary GitHub source archives. Exact `publicsuffix` gitlink `a179a48c465e818cfd8d626691cb317985da87fb` was retrieved separately. Its data source and MPL-2.0 license are included. Do not let the tldts package's MIT metadata hide that dataset notice.
- `xmlchars@2.2.0`: annotated `v2.2.0` tag peeled to `1b54de0e417a1744a505f101b28314466b380bb0`; archive hash `e9e1e37d810a6d23638a1535015b72f14ccc3c782b71b8f73b05aa2d4784fb9b`. Source includes editable TypeScript and configuration. See `xmlchars-source.json`.
- `undici@8.11.2`: registry source commit `7e016ad7e5bd6540170069a9a28b1e633b29664f` includes vendored llhttp C and WebAssembly build scripts. This preparation additionally retrieved llhttp `9.3.1` source tag `06b12e87f209da43e3e9e0f958b7464a4a218896` and release tag `4fce8cac9433aa4728428bb3b26880d32ad05c88`; all four vendored C/header files match release bytes exactly. Editable generator TypeScript is in the source archive. See `llhttp-source.json`. WASM was not regenerated.

## Notice handling and limitations

1. Preserve installed and upstream notices by component. Choose the Apache option for DOMPurify only in the downstream explanation; retain its original dual-license texts. Preserve actual MIT grants for legacy packages with missing package.json license metadata.
2. An absent standalone LICENSE filename is not itself absence of a grant. For example, `isarray@0.0.1` includes its complete MIT grant in README, and `pure-uuid` includes it in source headers. Original npm archives preserve these. Additional source snapshots restore notices for other packages omitted by npm packaging.
3. Source and license overlap verification is not a reproducible-build test. `source-map@0.5.7` has different prebuilt `dist/` files between npm and its registry-linked commit; its editable source is supplied, but those generated browser outputs have not been independently reproduced. Other noted license-file byte differences in dom-selector/xmlbuilder normalize to identical text (line ending changes). The detailed mapping leaves mismatches visible rather than overwriting originals.
4. Source archives contain upstream test/docs assets with their own notices; retain those notices when distributing the full archive. If later pruning archives, recheck which asset notices still apply. Several repository test submodules are not bundled; these are recorded as test-only coverage limits, not application runtime source substitutes.
5. This pass supplements obvious generated-source and notice gaps; it is not a proof that every embedded database, test asset, build dependency and generated output in 286 entries has been recreated. Development-tool lockfiles/configuration present in retrieved repositories are preserved; their entire development dependency closure is not independently archived here.
6. Original Waline/core source, downstream wrapper/modifications, build/deployment instructions, complete runtime npm archives, GPL/AGPL notices, and an exact-version network source offer remain part of the main assembly task. This directory is only the dependency supplement. Public distribution/deployment still requires the user's separate approval.

## Included files

`COPY-SAFE-FILES.txt` lists the relative files intended for the source/notice supplement: immutable archives, primary registry metadata, evidence manifests, extracted notices, asset inventory, license texts and this report. All are public dependency material or reports/scripts created for this task. No credentials, environment secrets, database contents, user comments, or unrelated private material were read or included. File hashes are in `SHA256SUMS`.
