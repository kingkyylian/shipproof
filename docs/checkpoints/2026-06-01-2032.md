# Project Checkpoint - 2026-06-01 20:32

## Project

- Root: `/Users/kyylian/shipproof`
- Git: `main`, clean, tracking `origin/main`
- Context: ShipProof is now a public GitHub Action/CLI project with a verified self-dogfood PR and v0.1.0 tag.

## Done This Session

- Created and pushed public repo: `https://github.com/kingkyylian/shipproof`
- Added repo hygiene files: `.gitignore`, `LICENSE`, `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md`
- Added config support:
  - `src/config.js`
  - `test/config.test.js`
  - `docs/configuration.md`
- Added JSON report contract:
  - `schemaVersion: "1.0"`
  - `shipproof-report.json`
  - `docs/report-schema.md`
- Added GitHub Action JSON artifact support:
  - `json-report-path`
  - `config-path`
- Added graceful fallback when PR comment permissions are unavailable:
  - `commentAction: "skipped-permission"`
- Fixed workflow permissions from `pull-requests: read` to `pull-requests: write`.
- Opened and merged dogfood PR:
  - `https://github.com/kingkyylian/shipproof/pull/1`
- Verified self-dogfood workflow:
  - Run: `https://github.com/kingkyylian/shipproof/actions/runs/26770243705`
  - Status: success
  - Markdown artifact uploaded
  - JSON artifact uploaded
  - PR comment created, then updated idempotently
- Created and pushed `v0.1.0` tag.
- Added agent feedback prompt support on `main` after `v0.1.0`:
  - `src/agent-feedback.js`
  - `test/agent-feedback.test.js`
  - `--agent-prompt`
  - `agentFeedbackPrompt` JSON field

## Current State

- Current branch: `main`
- Latest commit: `0181738 Add agent feedback prompts`
- Remote head: `origin/main` at `0181738`
- Release tag: `v0.1.0` points to `51410c4 Finalize v0.1.0 release notes`
- Note: agent feedback prompt is currently Unreleased and is not part of `v0.1.0`.
- Worktree was clean when this checkpoint was created.

## Important Files / Artifacts

- `README.md`: public usage, workflow permissions, JSON report, agent prompt docs.
- `action.yml`: composite GitHub Action inputs.
- `.github/workflows/shipproof.yml`: self-dogfood workflow.
- `src/core.js`: proof report creation, score, markdown render, agent prompt integration.
- `src/browser.js`: current browser smoke implementation; next main target.
- `src/action.js`: GitHub mode, artifact writing, comment create/update/fallback.
- `src/config.js`: default config and loader.
- `src/agent-feedback.js`: coding-agent feedback prompt generator.
- `docs/live-github-verification.md`: self-dogfood evidence and workflow run links.
- `docs/superpowers/plans/2026-06-01-shipproof-production-roadmap.md`: broader roadmap.

## Verification

- Command: `npm test`
  - Result: passed, 48/48 tests
- Command: `npm run smoke:github-mock`
  - Result: passed
- Command: `npm pack --dry-run`
  - Result: passed, 16 files, 16.8 kB package
- Command: `git ls-remote origin refs/heads/main`
  - Result: remote main at `0181738e32f47a805ec40db888c676c387ee81e8`
- Command: `git ls-remote --tags origin 'v0.1.0^{}'`
  - Result: tag target `51410c41d9d819bd2b40ede1aea92d763a1436fa`
- GitHub dogfood:
  - PR #1 merged
  - Workflow `ShipProof / proof` passed
  - PR comment marker `<!-- shipproof-report -->` created and updated

## Open Questions / Risks

- `v0.1.0` is a GitHub Action tag only; npm package remains `"private": true`.
- Browser smoke is still v1:
  - no server stdout/stderr artifact
  - no readiness URL config
  - missing Playwright policy is still blunt
  - route inference is narrow
- Security-lite v2 not started:
  - no line numbers
  - no allowlist
  - no SARIF
- Monorepo support not started.

## Next Steps

1. Implement Browser smoke v2 with TDD:
   - server log artifact paths
   - early dev server exit handling
   - `readyUrl`, `timeoutMs`, `waitUntil`
   - configured routes merge
   - advisory missing Playwright mode
2. Update docs:
   - `docs/browser-smoke.md`
   - `docs/configuration.md`
   - `docs/report-schema.md` if new report fields are added
3. Verify and ship:
   - `npm test`
   - `npm run smoke:github-mock`
   - `npm pack --dry-run`
   - dogfood PR if workflow behavior changes

## Resume Prompt

Continue from this checkpoint. First read this file and `/Users/kyylian/AGENTS.md`, then inspect `src/browser.js`, `test/browser.test.js`, `src/config.js`, and `docs/superpowers/plans/2026-06-01-shipproof-production-roadmap.md` before making changes. Start with Browser smoke v2 using TDD.
