# ShipProof Release Readiness - v0.2.0

Last updated: 2026-06-04

## Released State

- Package version: `0.2.0`
- Package is still private: `package.json#private` is `true`
- Existing baseline tag: `v0.1.0`
- Released tag: `v0.2.0`
- Release target commit: `9e1f1b11f6f34f677dd445a58f69481523959987`
- GitHub release: `https://github.com/kingkyylian/shipproof/releases/tag/v0.2.0`
- Active docs reference: `kingkyylian/shipproof@v0.2.0`

The `v0.2.0` GitHub Action release is live. External users can install the documented action reference:

```yaml
- uses: kingkyylian/shipproof@v0.2.0
```

## Verified Local Gates

- `npm test`: 96/96 tests passed.
- `npm run smoke:github-mock`: passed.
- `npm run release:readiness`: passed.
- `npm pack --dry-run`: passed, `shipproof@0.2.0`, 26 files, 35.0 kB.
- `npm run pack:smoke -- --clean`: passed; packs `shipproof-0.2.0.tgz`, runs the packed CLI, and verifies JSON schema `1.0` plus SARIF `2.1.0` with 0 results.
- `npm audit --omit=dev`: passed, 0 vulnerabilities.
- `git diff --check`: passed.
- ShipProof self-proof: passed, ship, score 88, JSON schema `1.0`, SARIF `2.1.0` with 0 results.

## Release Verification

- Release PR: `#8`, merged.
- Release commit: `9e1f1b11f6f34f677dd445a58f69481523959987`.
- Release tag: `v0.2.0`.
- GitHub release: `ShipProof v0.2.0`, non-draft, non-prerelease.
- Release notes source: `docs/release-notes/v0.2.0.md`.

Post-release checks:

- `git ls-remote --tags origin "v0.2.0*"` returned `v0.2.0` at `9e1f1b11f6f34f677dd445a58f69481523959987`.
- `gh release view v0.2.0 --json tagName,name,url,isDraft,isPrerelease,publishedAt,targetCommitish` confirmed the public release.
- Dogfood run: `26881315207`.
- Dogfood PR: `#9`, closed without merge.
- Dogfood workflow step: `Run kingkyylian/shipproof@v0.2.0`.
- Dogfood report: passed, ship, score 100.
- Dogfood JSON artifact: schema `1.0`, status `passed`, decision `ship`, score 100.
- Dogfood SARIF artifact: version `2.1.0`, results 0.

## Beta Evidence

Successful external command reports:

- `trustq`: passed, ship, score 88.
- `admin-web`: passed, ship, score 94.
- `cvboost`: passed, ship, score 94.
- `unity-apple-scaffold-agent`: passed, ship, score 94.
- `handoffkit`: passed, ship, score 94.
- `tcli-monorepo`: passed, ship, score 100.

Browser evidence:

- `admin-web-browser-advisory`: passed, ship, score 94; advisory `browser-smoke:not_checked` for missing Playwright.
- `playwright-fixture`: passed, ship, score 100; required `browser-smoke:passed` with real Chromium screenshot.

Failure evidence:

- `portfolio`: failed, no-ship, score 79; failed lint was correctly surfaced.

Full matrix: `docs/beta-test-matrix.md`

## Ongoing Contract Gate

Run this after release-housekeeping changes:

```sh
npm run release:readiness
```

The gate verifies package metadata, lockfile version, package file surface, release notes drift, action reference docs, GitHub Action entrypoint wiring, and this post-release evidence checklist.

Use `docs/release-notes/v0.2.0.md` as the release notes source. The release notes file contains only the `0.2.0` section from `CHANGELOG.md`, not the entire changelog.

## Npm Publishing

Npm publishing is intentionally not ready:

- package remains private;
- local npm auth was previously missing;
- no trusted publishing workflow exists yet.

Treat npm as a later release channel. The completed `v0.2.0` release path is the GitHub Action tag and GitHub release.
