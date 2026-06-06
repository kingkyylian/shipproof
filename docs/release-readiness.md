# ShipProof Release Readiness - v0.4.0

Last updated: 2026-06-06

## Release State

- Package version: `0.4.0`
- Package is still private: `package.json#private` is `true`
- Released tag: `v0.4.0`
- GitHub release: `https://github.com/kingkyylian/shipproof/releases/tag/v0.4.0`
- Release target commit: `494167a648e96d26e292a4033604c1a7d59f1fcc`
- Active docs reference: `kingkyylian/shipproof@v0.4.0`
- Post-release dogfood: PR #28, run `27069150898`.
- Dogfood artifact evidence: Markdown, JSON, and SARIF artifacts were downloaded and parsed; JSON schema `1.0`, status `passed`, decision `ship`, score `100`; SARIF `2.1.0` results 0.

The `v0.4.0` GitHub Action release is live and was dogfooded through the published action reference.

```yaml
- uses: kingkyylian/shipproof@v0.4.0
```

## Required Local Gates

Run these before release approval and before any future release refresh:

- `npm test`
- `npm run release:readiness`
- `npm run pack:smoke -- --clean`
- `npm pack --dry-run --json`
- `npm run publish:dry-run`
- `npm audit --omit=dev`
- `git diff --check`

## Release Notes

Use `docs/release-notes/v0.4.0.md` as the release notes source. The release notes file contains only the `0.4.0` section from `CHANGELOG.md`, not the entire changelog.

## Candidate Scope

This release candidate includes:

- `shipproof init --dry-run` onboarding for starter workflow and config generation;
- overwrite-safe `shipproof init` file writes;
- config validation that rejects invalid `browser.waitUntil` values before proof checks run;
- first-time GitHub Action setup docs and config validation docs.

## Npm Publishing

Npm publishing remains disabled for this release candidate.

The package remains private, no trusted publishing workflow exists, and no npm package will be published as part of the `v0.4.0` GitHub Action release candidate. The local `publish:dry-run` gate exists only to keep the future npm publishing path auditable.

## Previous Release

- Released tag: `v0.3.0`
- GitHub release: `https://github.com/kingkyylian/shipproof/releases/tag/v0.3.0`
- Release target commit: `31847cbbe1c8aba1f5e65d42ea983d90ce3c9403`
- Published action dogfood: PR #20, run `27021495375`.
- Post-release observations are tracked in `docs/post-release-observations.md`.

## Release Approval Boundary

Do not publish to npm without a separate explicit npm publishing approval. Future tags, GitHub releases, or release-line changes still require explicit approval for that exact action.
