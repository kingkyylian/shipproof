# ShipProof Release Readiness - v0.2.0

Last updated: 2026-06-02

## Current Release State

- Package version: `0.2.0`
- Package is still private: `package.json#private` is `true`
- Existing tag: `v0.1.0`
- Missing tag: `v0.2.0`
- Missing GitHub release: `v0.2.0`
- Active docs reference: `kingkyylian/shipproof@v0.2.0`

The `v0.2.0` tag and GitHub release must be created before external users can install the documented GitHub Action reference.

## Verified Local Gates

- `npm test`: 96/96 tests passed.
- `npm run smoke:github-mock`: passed.
- `npm run release:readiness`: passed.
- `npm pack --dry-run`: passed, `shipproof@0.2.0`, 26 files, 34.9 kB.
- `npm run pack:smoke -- --clean`: passed; packs `shipproof-0.2.0.tgz`, runs the packed CLI, and verifies JSON schema `1.0` plus SARIF `2.1.0` with 0 results.
- `npm audit --omit=dev`: passed, 0 vulnerabilities.
- `git diff --check`: passed.
- ShipProof self-proof: passed, ship, score 88, JSON schema `1.0`, SARIF `2.1.0` with 0 results.

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

## Release Approval Required

Do not run these without explicit release approval:

Run the local contract gate before requesting that approval: `npm run release:readiness`

```sh
npm run release:readiness
```

```sh
git tag v0.2.0 <final-commit-sha>
git push origin v0.2.0
gh release create v0.2.0 --title "ShipProof v0.2.0" --notes-file docs/release-notes/v0.2.0.md
```

Use `docs/release-notes/v0.2.0.md` as the release notes source. The release notes file contains only the `0.2.0` section from `CHANGELOG.md`, not the entire changelog.

## Post-Release Verification

After the tag and release are created, verify:

```sh
git ls-remote --tags origin "v0.2.0*"
gh release view v0.2.0 --json tagName,name,url,isDraft,isPrerelease,publishedAt
```

Then dogfood the documented action reference:

```yaml
- uses: kingkyylian/shipproof@v0.2.0
```

The dogfood run should prove:

- workflow conclusion is `success` for a passing proof;
- Markdown report artifact exists;
- JSON report artifact exists;
- SARIF artifact exists;
- PR comment contains `<!-- shipproof-report -->`;
- report status is `passed`;
- decision is `ship`.

## Npm Publishing

Npm publishing is intentionally not ready:

- package remains private;
- local npm auth was previously missing;
- no trusted publishing workflow exists yet.

Treat npm as a later release channel. The immediate release path is the GitHub Action tag and GitHub release.
