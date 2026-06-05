# ShipProof Post-Release Observations

## v0.3.0

| Date | Target | Reference | Result | Evidence | Follow-up |
| --- | --- | --- | --- | --- | --- |
| 2026-06-05 | self-dogfood PR #20 | `kingkyylian/shipproof@v0.3.0` | passed, ship, score 100 | run `27021495375`, JSON schema `1.0`, SARIF `2.1.0` results 0 | none |

## Watch List

- Permission-degraded PR comments should still write Markdown, JSON, SARIF, and step summary artifacts.
- Browser-smoke routes should include useful route failure details without hiding server logs.
- Package-manager detection should stay correct for npm, pnpm, single-package repos, and workspace repos.
- Executed optional checks must fail the proof when they fail.
