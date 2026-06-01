# ShipProof

ShipProof is a verification layer for AI-generated code. It does not write code for the user; it runs proof checks and produces a merge-facing report before the user trusts an AI-authored change.

## Current MVP

- Discovers `lint`, `test`, `typecheck`, and `build` scripts from `package.json`.
- Runs checks in a stable order.
- Stops after a required check fails and marks later checks as `not_checked`.
- Classifies changed files into auth, database, payment, backend, config, dependency, and frontend risk buckets.
- Runs security-lite checks for committed env files, likely secrets, public client secrets, unsafe CORS, and auth-sensitive edits.
- Detects supported frontend projects and runs browser smoke checks for changed UI routes.
- Produces a `ship`, `review`, or `no-ship` decision with a 0-100 score.
- Prints a Markdown report suitable for a GitHub PR comment.

## Usage

```sh
npm test
npm run smoke:github-mock
npm run shipproof -- --changed src/core.js,test/core.test.js
npm run shipproof -- --changed src/app/login/page.tsx --browser-base-url http://127.0.0.1:3000
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
  pull-requests: read

jobs:
  proof:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: kingkyylian/shipproof@v0.1.0
        with:
          github-token: ${{ github.token }}
          report-path: shipproof-report.md
          screenshot-dir: shipproof-screenshots

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: shipproof-report
          path: shipproof-report.md
          if-no-files-found: error

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: shipproof-screenshots
          path: shipproof-screenshots
          if-no-files-found: ignore
```

The action reads changed files from the pull request, writes a Markdown report, appends it to the GitHub step summary, and creates or updates one PR comment marked with `<!-- shipproof-report -->`.

`v0.1.0` is the planned first public release tag. Until that tag exists, use ShipProof from this repository with `uses: ./` after checkout or pin a commit SHA from the public repository.

Browser smoke checks run automatically for detected Next.js and Vite projects when frontend files change. ShipProof can reuse an existing dev server with `browser-base-url`, otherwise it starts the detected `dev` script. The target project must have `playwright` or `@playwright/test` installed for real browser checks.

Security-lite checks run automatically and are required. High severity findings fail the proof and produce a `no-ship` decision.

`npm run smoke:github-mock` starts a local mock GitHub API and verifies the real `shipproof github` CLI path for PR file lookup, report artifact writing, step summary writing, and PR comment creation. Use the `github-api-url` input for GitHub Enterprise or local integration verification.

## Product Direction

ShipProof starts as a CLI because the first product promise is proof, not a dashboard. The same core will power:

1. GitHub Action PR comments.
2. Playwright browser smoke checks.
3. Security-lite checks for auth, secrets, RLS, CORS, and public storage.
4. Agent feedback prompts for Claude Code, Codex, Cursor, OpenCode, and similar tools.
