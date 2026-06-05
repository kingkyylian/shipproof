# ShipProof npm Publishing Plan

## Current State

- `package.json#private` is `true`.
- GitHub Action distribution is live at `kingkyylian/shipproof@v0.3.0`.
- npm publishing is not part of the current release channel.
- The `v0.3.0` GitHub Action release was dogfooded through the published action reference before npm publishing work started.
- Release validation already includes `npm pack --dry-run`, `npm run pack:smoke -- --clean`, and a local `publish:dry-run` script.
- `npm run release:readiness` checks that this publishing plan tracks the current GitHub Action release line before any future publishing approval.

## v0.3.1 Stabilization First

Before opening the dedicated npm publishing PR:

- Run `kingkyylian/shipproof@v0.3.0` on additional real pull requests and record any permission, artifact, browser-smoke, or false-positive issues.
- Keep `v0.3.1` limited to patch-safe fixes: docs clarity, release gate lifecycle issues, pack smoke hardening, and beta-discovered regressions.
- Do not remove `private: true` in a stabilization PR.
- Do not add a publish workflow in a stabilization PR.
- Keep npm registry publication behind a separate explicit approval.

## Required Decisions

- Use npm trusted publishing from GitHub Actions.
- Keep GitHub Action release and npm package release on the same version.
- Require `npm publish --dry-run` before publish.
- Require post-publish smoke with `npx shipproof --help` or `npm exec shipproof -- --help`.
- Decide whether the first npm version is the next normal release or a pre-release such as `0.3.0-beta.0`.
- Document the npm package access level before removing `private: true`.

## Proposed Release Shape

1. Open a dedicated npm publishing PR.
2. Remove `private: true` in that PR only.
3. Add the trusted publishing workflow in `.github/workflows/npm-publish.yml`.
4. Keep the local `publish:dry-run` script passing without publishing.
5. Run the full release gate:
   - `npm test`
   - `npm run release:readiness`
   - `npm run pack:smoke -- --clean`
   - `npm pack --dry-run`
   - `npm run publish:dry-run`
   - `npm audit --omit=dev`
   - `git diff --check`
6. Run `npm publish --dry-run` from the exact commit intended for release.
7. Merge only after the ShipProof proof check passes on the PR.
8. Tag the verified merge commit and create the GitHub release.
9. Publish through the trusted publishing workflow for the same version.
10. Run post-publish smoke with the registry package.

## Post-Publish Smoke

The first npm release must prove that the registry package exposes the same CLI surface as the packed tarball:

```sh
npx shipproof --help
npm exec shipproof -- --help
```

If the package is published under a pre-release dist-tag, include the tag in the smoke command.

## Rollback and Deprecation Plan

- If a broken package is published, publish a fixed patch version instead of deleting history.
- Deprecate the broken version with an actionable message that points to the fixed version.
- Keep the GitHub Action tag stable unless the same release commit is affected.
- Record the failed publish, fixed version, deprecation command, and post-fix smoke output in the release notes.

## Do Not Do

- Do not remove `private: true` outside the npm publishing PR.
- Do not publish from a local machine unless trusted publishing is explicitly rejected.
- Do not publish without a rollback/deprecation plan.
- Do not tag a release before the npm dry-run gate and ShipProof proof both pass.
