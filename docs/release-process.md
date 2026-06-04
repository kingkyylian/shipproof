# ShipProof Release Process

## Preconditions

- `main` is clean and tracking `origin/main`.
- `npm test` passes.
- `npm run release:readiness` passes.
- `npm run pack:smoke -- --clean` passes.
- `npm pack --dry-run` reports the expected file count and size.
- `npm audit --omit=dev` reports 0 vulnerabilities.
- The release notes file exists under `docs/release-notes/`.
- The package remains private until npm publishing is explicitly prepared.

## GitHub Action Release

1. Tag the verified merge commit:
   `git tag vX.Y.Z <merge-commit-sha>`
2. Push the tag:
   `git push origin vX.Y.Z`
3. Create the GitHub release:
   `gh release create vX.Y.Z --title "ShipProof vX.Y.Z" --notes-file docs/release-notes/vX.Y.Z.md`
4. Verify tag and release:
   `node scripts/post-release-verify.mjs --version X.Y.Z`
   `git ls-remote --tags origin "vX.Y.Z*"`
   `gh release view vX.Y.Z --json tagName,name,url,isDraft,isPrerelease,publishedAt,targetCommitish`
5. Open a temporary dogfood PR that uses `kingkyylian/shipproof@vX.Y.Z`.
6. Verify workflow success, PR comment, Markdown artifact, JSON artifact, and SARIF artifact.
7. Close the dogfood PR without merge.

## Post-Release Housekeeping

- Update `docs/release-readiness.md` with the released tag, release URL, release target commit, dogfood PR, dogfood run, and artifact evidence.
- Add a checkpoint under `docs/checkpoints/` and update `docs/checkpoints/LATEST.md`.
- Open a housekeeping PR for the documentation changes.
- Keep npm publishing out of the release unless the npm publishing plan has been completed and explicitly approved.
