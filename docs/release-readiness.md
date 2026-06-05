# ShipProof Release Readiness - v0.3.0

Last updated: 2026-06-04

## Release Candidate State

- Package version: `0.3.0`
- Package is still private: `package.json#private` is `true`
- Existing released tag: `v0.2.0`
- Target tag: `v0.3.0`
- Target GitHub release: `https://github.com/kingkyylian/shipproof/releases/tag/v0.3.0`
- Active docs reference: `kingkyylian/shipproof@v0.3.0`
- Release approval: required before tag or GitHub release.
- GitHub PR proof: required on the release-candidate PR before merge.

The `v0.3.0` GitHub Action release is not tagged yet. The release-candidate PR prepares the package metadata, release notes, docs references, and release gate for explicit release approval.

```yaml
- uses: kingkyylian/shipproof@v0.3.0
```

## Required Local Gates

Run this full gate before release approval:

- Run `npm run release:readiness` before release approval.
- Run `npm run publish:dry-run` before release approval.

```sh
npm test
npm run release:readiness
npm run pack:smoke -- --clean
npm pack --dry-run
npm run publish:dry-run
npm audit --omit=dev
git diff --check
```

The release-candidate PR must also pass the ShipProof GitHub Action proof check before merge.

## Local Verification - 2026-06-04

- `npm test`: 109/109 tests passed.
- `npm run release:readiness`: passed for `v0.3.0`.
- `npm run pack:smoke -- --clean`: passed for `shipproof@0.3.0`.
- `npm pack --dry-run`: passed, `shipproof@0.3.0`, 27 files, 39.0 kB.
- `npm run publish:dry-run`: passed as a dry run; no package was published.
- `npm audit --omit=dev`: passed, 0 vulnerabilities.
- `git diff --check`: passed.
- ShipProof self-proof: passed, ship, score 88, JSON schema `1.0`, SARIF `2.1.0` with 0 results.
- Beta evidence matrix: v0.3 targets complete with 11 successful real-repository reports, 2 blocking failure reports, 3 real browser screenshots across 2 current v0.3 browser-smoke reports, 2 monorepo reports, and 1 permission-degraded PR scenario.

## Release Notes

Use `docs/release-notes/v0.3.0.md` as the release notes source. The release notes file contains only the `0.3.0` section from `CHANGELOG.md`, not the entire changelog.

## Candidate Scope

This release candidate includes:

- release operation docs and post-release verification helpers;
- beta feedback and report audit tooling;
- PR-facing Merge Signal report output;
- browser smoke route result reporting and recent server log excerpts;
- Supabase/RLS security-lite heuristics and severity override config;
- npm publishing readiness docs and a local dry-run gate.

## Npm Publishing

Npm publishing remains disabled for this release candidate.

The package remains private, no trusted publishing workflow exists, and no npm package should be published as part of the `v0.3.0` GitHub Action release candidate. The local `publish:dry-run` gate exists only to keep the future npm publishing path auditable.

## Release Approval Boundary

After this PR is merged, do not create `v0.3.0`, push the tag, create the GitHub release, or publish to npm without explicit approval for that exact action.
