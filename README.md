# ShipProof

ShipProof is a verification layer for AI-generated code. It does not write code for the user; it runs proof checks and produces a merge-facing report before the user trusts an AI-authored change.

## Current MVP

- Discovers `lint`, `test`, `typecheck`, and `build` scripts from `package.json`.
- Runs checks in a stable order with the detected package manager.
- Marks the proof failed when any executed check fails.
- Stops after a required check fails and marks later checks as `not_checked`.
- Classifies changed files into auth, database, payment, backend, config, dependency, and frontend risk buckets.
- Detects npm and pnpm workspaces and runs relevant package-local checks for changed packages.
- Runs security-lite checks for committed env files, likely secrets, public client secrets, unsafe CORS, and auth-sensitive edits.
- Detects supported frontend projects and runs browser smoke checks for changed UI routes.
- Produces a `ship`, `review`, or `no-ship` decision with a 0-100 score.
- Prints a Markdown report suitable for a GitHub PR comment.
- Writes a JSON report payload with `schemaVersion: "1.0"` in GitHub mode.
- Writes SARIF security-lite results in GitHub mode.
- Adds failed-check excerpts, rerun commands, and artifact references to merge-facing reports.
- Tracks baseline security findings without blocking new work.
- Generates a focused agent feedback prompt for `review` and `no-ship` reports.

## Usage

```sh
npm test
npm run smoke:github-mock
npm run shipproof -- --changed src/core.js,test/core.test.js
npm run shipproof -- --changed src/app/login/page.tsx --browser-base-url http://127.0.0.1:3000
npm run shipproof -- --changed src/core.js --config shipproof.config.json --json-report-path /tmp/shipproof-report.json
npm run shipproof -- --changed src/api/route.ts --security-sarif-path /tmp/shipproof-security.sarif
npm run shipproof -- --changed src/api/route.ts --agent-prompt
```

If `--changed` is omitted, ShipProof reads changed files from:

```sh
git diff --name-only HEAD
```

## GitHub Action

Use ShipProof in a pull request workflow after checking out the repository:

```yaml
name: ShipProof

on:
  pull_request:

permissions:
  contents: read
  issues: write
  pull-requests: write

jobs:
  proof:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: kingkyylian/shipproof@v0.2.0
        with:
          github-token: ${{ github.token }}
          report-path: shipproof-report.md
          json-report-path: shipproof-report.json
          security-sarif-path: shipproof-security.sarif
          screenshot-dir: shipproof-screenshots
          browser-log-dir: shipproof-browser-logs

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: shipproof-report
          path: shipproof-report.md
          if-no-files-found: error

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: shipproof-report-json
          path: shipproof-report.json
          if-no-files-found: error

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: shipproof-security-sarif
          path: shipproof-security.sarif
          if-no-files-found: error

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: shipproof-screenshots
          path: shipproof-screenshots
          if-no-files-found: ignore
```

The action reads changed files from the pull request, writes Markdown and JSON reports, appends the Markdown report to the GitHub step summary, and creates or updates one PR comment marked with `<!-- shipproof-report -->`.

`v0.2.0` is the current GitHub Action release line. For unreleased local development, use ShipProof from this repository with `uses: ./` after checkout or pin a commit SHA from the public repository.

If GitHub does not grant comment permissions, ShipProof still writes report artifacts and the step summary. In that case the run reports `commentAction: skipped-permission` instead of failing the proof only because a PR comment could not be written.

Browser smoke checks run automatically for detected Next.js and Vite projects when frontend files change. ShipProof can reuse an existing dev server with `browser-base-url`, otherwise it starts the detected `dev` script. The target project must have `playwright` or `@playwright/test` installed for real browser checks.

Browser smoke writes route screenshots and, when ShipProof starts the dev server, stdout/stderr logs. See `docs/browser-smoke.md`.

Monorepo support detects npm and pnpm workspaces, maps changed files to package roots, and runs package-local checks such as `npm --workspace web test` or `pnpm --filter web test`. See `docs/monorepo.md`.

Single-package repositories also use the detected lockfile package manager for root checks and browser dev servers, such as `pnpm test`, `pnpm dev`, or `npm test`.

Security-lite checks run automatically and are required. High severity findings fail the proof and produce a `no-ship` decision. Findings include line numbers when available, redacted snippets, allowlist guidance, and SARIF output. See `docs/security-lite.md`.

Configuration is optional. Add `shipproof.config.json` when a repository needs explicit browser routes, advisory browser smoke, disabled security-lite, custom score thresholds, or custom report paths. See `docs/configuration.md` and `docs/report-schema.md`.

`npm run smoke:github-mock` starts a local mock GitHub API and verifies the real `shipproof github` CLI path for PR file lookup, report artifact writing, step summary writing, and PR comment creation. Use the `github-api-url` input for GitHub Enterprise or local integration verification.

## Product Direction

ShipProof starts as a CLI because the first product promise is proof, not a dashboard. The same core will power:

1. GitHub Action PR comments.
2. Playwright browser smoke checks.
3. Security-lite checks for auth, secrets, RLS, CORS, and public storage.
4. Agent feedback prompts for Claude Code, Codex, Cursor, OpenCode, and similar tools.
