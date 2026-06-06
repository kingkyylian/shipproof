# ShipProof Release Readiness - v0.4.0

Last updated: 2026-06-06

## Release State

- Package version: `0.4.0`
- Package is still private: `package.json#private` is `true`
- Existing released tag: `v0.3.0`
- Target tag: `v0.4.0`
- Target GitHub release: `https://github.com/kingkyylian/shipproof/releases/tag/v0.4.0`
- Active docs reference: `kingkyylian/shipproof@v0.4.0`
- Release approval: required before tag or GitHub release.
- GitHub PR proof: required on the release-candidate PR before merge.

The `v0.4.0` GitHub Action release is not live yet. This document prepares the release-candidate contract only.

```yaml
- uses: kingkyylian/shipproof@v0.4.0
```

## Required Local Gates

Run these before release approval:

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

Do not create `v0.4.0`, push release tags, create GitHub releases, or publish to npm without explicit approval for that exact action.
