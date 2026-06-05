# ShipProof Release Readiness - v0.3.0

Last updated: 2026-06-05

## Release State

- Package version: `0.3.0`
- Package is still private: `package.json#private` is `true`
- Existing released tag: `v0.2.0`
- Released tag: `v0.3.0`
- GitHub release: `https://github.com/kingkyylian/shipproof/releases/tag/v0.3.0`
- Release target commit: `31847cbbe1c8aba1f5e65d42ea983d90ce3c9403`
- Active docs reference: `kingkyylian/shipproof@v0.3.0`
- Release-readiness refresh PR: #19, proof run `27021220488`, merged at `31847cbbe1c8aba1f5e65d42ea983d90ce3c9403`.
- Post-release dogfood: PR #20, run `27021495375`, closed without merge after verification.

The `v0.3.0` GitHub Action release is live and was verified through the published action reference.

```yaml
- uses: kingkyylian/shipproof@v0.3.0
```

## Required Local Gates

The final local gate before release approval was:

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

The release-readiness refresh PR #19 also passed the ShipProof GitHub Action proof check before merge.

## Local Verification - 2026-06-05

- `npm test`: 109/109 tests passed.
- `npm run release:readiness`: passed for `v0.3.0`.
- `npm run pack:smoke -- --clean`: passed for `shipproof@0.3.0`.
- `npm pack --dry-run`: passed, `shipproof@0.3.0`, 27 files, 39.0 kB.
- `npm run publish:dry-run`: passed as a dry run; no package was published.
- `npm audit --omit=dev`: passed, 0 vulnerabilities.
- `git diff --check`: passed.
- ShipProof self-proof: passed, ship, score 94, JSON schema `1.0`, SARIF `2.1.0` with 0 results.
- Beta evidence matrix: v0.3 targets complete with 11 successful real-repository reports, 2 blocking failure reports, 3 real browser screenshots across 2 current v0.3 browser-smoke reports, 2 monorepo reports, and 1 permission-degraded PR scenario.

## Post-Release Verification - 2026-06-05

- `git ls-remote --tags origin "v0.3.0*"`: `v0.3.0` points to `31847cbbe1c8aba1f5e65d42ea983d90ce3c9403`.
- `gh release view v0.3.0`: release is non-draft, non-prerelease, published at `2026-06-05T14:40:05Z`, target commitish `main`.
- `node scripts/post-release-verify.mjs --version 0.3.0`: printed the required remote tag and GitHub release verification commands.
- Published action dogfood PR #20: `https://github.com/kingkyylian/shipproof/pull/20`.
- Published action dogfood run: `https://github.com/kingkyylian/shipproof/actions/runs/27021495375`.
- Dogfood workflow step: `Run kingkyylian/shipproof@v0.3.0`.
- Dogfood PR comment contains `<!-- shipproof-report -->`.
- Dogfood Markdown artifact: status `passed`, decision `ship`, score `100/100`.
- Dogfood JSON artifact: schema `1.0`, status `passed`, decision `ship`, score `100`, security findings `0`.
- Dogfood SARIF artifact: version `2.1.0`, 1 run, 0 results.
- Dogfood PR #20 was closed without merge so `main` continues to test the local checkout action in normal PR workflows.

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

The package remains private, no trusted publishing workflow exists, and no npm package was published as part of the `v0.3.0` GitHub Action release. The local `publish:dry-run` gate exists only to keep the future npm publishing path auditable.

## Release Approval Boundary

The explicit `v0.3.0` GitHub release approval was used for the tag and GitHub release above. Do not create future tags, push release tags, create GitHub releases, or publish to npm without explicit approval for that exact action.
