# Pinned Waline core source and verified rebuild inputs

## Verified result

`@waline/core@0.1.0` was rebuilt from Waline commit `c4b0f1ebb9a7970d36493d4c3580f3f43e098fa5`. All four generated files match the core bundled in `@waline/vercel@1.43.4` byte-for-byte. The original upstream build and fresh, isolated offline replays both pass. The two upstream core test files pass all **17 tests**.

This directory is an input component for the enclosing corresponding-source release. It is not by itself a complete backend release or a deployment acceptance result. No database, secret, public repository, or deployment was accessed or changed by this verification.

## Rebuild from this directory

Prerequisites:

- Linux x86-64 using glibc (verification used Debian glibc 2.41 and kernel 6.18.44)
- **Node.js 24.20.0** on PATH; Node is a general-purpose runtime prerequisite and is not redistributed here
- Python 3.9+ standard library (verified with Python 3.12.14), Bash, tar/gzip, and sha256sum
- About 250 MB free space for a new build directory

From the directory containing this README:

```sh
node --version                         # must print v24.20.0
sha256sum --check SHA256SUMS
bash scripts/rebuild-core.sh ./rebuild-check
```

The output directory must not already exist. If the runtime is not on PATH, use:

```sh
NODE_BIN=/path/to/node-v24.20.0/bin/node bash scripts/rebuild-core.sh ./rebuild-check
```

This command uses only included source/tool archives plus the documented runtime and system utilities. It does not require npm/pnpm to be installed globally or any previous checkout, build directory, node_modules, or package cache. It verifies the source archive, every exported source blob, and all cached tool tarballs; reconstructs the exact recorded tool layout; runs the unchanged core `tsdown.config.ts` including declaration generation and publint; and checks all four expected output hashes. `npm_config_offline=true` is set for child package-manager work. The final validated replay used a fresh HOME and a minimal PATH, with only the Node prerequisite supplied externally.

Generated outputs are under `rebuild-check/source/packages/core/dist/`.

## Contents and provenance

- `archives/waline-c4b0f1ebb9a7970d36493d4c3580f3f43e098fa5.tar.gz`: deterministic full-repository Git archive, produced with `git archive --format=tar --prefix=waline-c4b0f1ebb9a7970d36493d4c3580f3f43e098fa5/ COMMIT | gzip -n -9`. It contains all 1,396 tracked blobs, including exact core TypeScript, tests, tsdown/TypeScript config, root manifests, full multi-document pnpm lock, workspace config, release/build scripts, and original notices. No generated core dist or node_modules was present in this archive. Every exported blob was independently checked against its Git object ID.
- `core-build-tools/pnpm-lock.yaml`: install-only closure derived from the second document of the original lock, retaining all exact core dependency snapshots and package integrity values. It has 127 package versions including non-Linux optional packages. The unchanged original lock remains in the full source archive.
- `core-build-tools/package.json`: small install-only manifest whose direct versions are the original resolved `tsdown@0.23.0` and `typescript@7.0.2`.
- `core-build-tools/tool-layout.json`: portable dependency links and generated bin shims recorded from the frozen pnpm installation, plus the exact pnpm package-manager inputs. Every target remains inside the restored tools directory.
- `build-registry-tarballs/`: 48 unchanged official npm archives, 49,659,809 bytes total, verified against the original lock's SHA-512 integrities and independently recorded SHA-256 values. These are the 46 Linux-x64/glibc core-build packages plus `pnpm@12.6.0` and `@pnpm/exe.linux-x64@12.6.0`, needed for unchanged publint packing. There is no Node runtime archive.
- `package-manager/`: exact npm manifest/lock for the pinned pnpm package manager. The package-manager entries match the first document of upstream's pnpm lock. Node is deliberately absent.
- `build-tool-notices/`: preserved notice texts from the official archives plus identified supplemental notices where a platform/tool tarball omitted a standalone text. Original archives are never rewritten. See the exact-file inventory and supplementary sources under `evidence/`.
- `scripts/restore-core-tools.py`: transparent, standard-library offline restoration; no package lifecycle scripts run, archive paths are checked, and tarball integrity is checked before extraction.
- `scripts/verify-source-tree.py`: self-contained source verification using the included Git-blob/SHA-256 manifest.
- The other scripts document acquisition and lock/layout derivation. They are not needed for the offline rebuild. Re-deriving the lock uses PyYAML; online cache acquisition uses npm and the original extracted source tree. `verify-pinned-source.py` optionally compares against a local upstream Git repository supplied as an argument.

The build tools are **prebuilt, unmodified general-purpose compiler/package-manager tools and dependencies**, not tools rebuilt from their preferred source as part of this work. Their source repositories and exact package license metadata/notices are recorded in `evidence/build-tool-license-inventory.json`. The core TypeScript and generated core are what this verification rebuilt and compared. The original source archive and tool notices keep their original grants; this README does not replace them or claim that every component is MIT-only.

## Expected SHA-256 outputs

| File | SHA-256 |
| --- | --- |
| index.js | cab3b45c1f682364e1d859163a364f4d2c7928c8c3be479d946d65c1e3831b50 |
| index.cjs | eb67ef3068bafa975714250ce4d48781cf79f6773a5443866e58025a44d9caf5 |
| index.d.ts | 42e613818d93515b26d0f16659aeab50568b1ade71308e32b702f80d1a3b8128 |
| index.d.cts | 42e613818d93515b26d0f16659aeab50568b1ade71308e32b702f80d1a3b8128 |

Source-archive SHA-256: `35b81cf1b3b99ba568553f226cae38f97ccdf7a36e788a8204787299c9dc5949`.

Unchanged original pnpm-lock SHA-256: `aab3fb81fc0e9607aee3ef3d7a5854d5def0fed1e97474c460852e6a71dc7775`.

## Verification details and limits

Original verification commands, with working directories supplied by the preparer:

```sh
pnpm --filter @waline/core install --frozen-lockfile --ignore-scripts --store-dir BUILD_STORE
pnpm --dir packages/core build
pnpm exec vitest run packages/core/__tests__
```

Versions: Node 24.20.0; pnpm 12.6.0; tsdown 0.23.0; rolldown 1.2.11; TypeScript 7.0.2; publint 0.3.24; Vitest 5.0.2. The original unmodified monorepo installation also installed unrelated root development dependencies. Those are not needed for the core replay and are excluded from this compact input bundle. The replay cache does not contain the full Vitest/test dependency closure; test results are reported from the original frozen monorepo install, not misrepresented as part of the compact offline replay.

Warnings are preserved in logs: TypeScript 7's compiler API is marked experimental, and publint notes that upstream core has no `engines.node` field. Both builds still succeed and match exactly. An initial replay attempt exposed a global pnpm/runtime dependency during publint; the final portable recipe resolves it by including pinned pnpm and using the documented Node runtime. No source/build-config edits or disabled validation were needed.

Historic absolute paths in log excerpts were normalized to `BUILD_WORKDIR`, `BUILD_HOME`, and `baseline-core-dist`; those labels are evidence context, not required paths. The included rebuild and restore scripts have no dependency on those prior locations.

Verified on 2026-10-05. Other operating systems, architectures, glibc versions, or Node versions have not been tested by this work. This source-build result does not verify PostgreSQL behavior, deployed network source-offer visibility, or the complete enclosing backend dependency/license release.

## Optional exact server-package replay

The unchanged upstream `scripts/publish-server.js` was then run with **only** `--dry-run --skip-build --pack-destination`. With Node 24.20.0 and **npm 11.9.0**, it reconstructed `waline-vercel-1.43.4.tgz` exactly: SHA-256 `d719b6592178d0ad6f93a803def4b93cbb27fa812b6742dc32f732abed788a7c`. A direct comparison against the official input archive also matched. Its 95 packed files include the rebuilt bundled core.

After the core rebuild, and with npm 11.9.0 also available on PATH:

```sh
bash scripts/repack-server-dry-run.sh ./rebuild-check ./server-pack-check
```

This optional helper checks source and core hashes, enforces exact Node/npm versions, and hardcodes the safe dry-run flags. It never invokes the publish branch. npm is an additional general-purpose prerequisite for this optional check and is not redistributed. This proves the pinned source → rebuilt core → original server package chain; the enclosing release's derivative-pruning verification remains separate.
