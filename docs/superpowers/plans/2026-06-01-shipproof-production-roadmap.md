# ShipProof Production Roadmap

Generated: 2026-06-01

## Objective

Turn ShipProof from a validated MVP into a production-ready verification layer for AI-generated code changes.

The strategy is not to build another AI coding agent. ShipProof should own the layer between AI-written code and production: repeatable proof, risk classification, browser smoke, security-lite checks, PR reporting, and actionable feedback loops for the next agent prompt.

## Current State

ShipProof already has a working MVP:

- Local CLI: `node ./bin/shipproof.js`
- GitHub Action entrypoint: `action.yml`
- PR file lookup through GitHub API
- Idempotent PR comment create/update with `<!-- shipproof-report -->`
- Markdown report generation
- Script discovery for `lint`, `typecheck`, `test`, and `build`
- Risk classification for auth, database, payment, backend, config, dependency, and frontend files
- Security-lite checks for committed env files, likely secrets, public client secrets, wildcard CORS, and auth-sensitive paths
- Browser smoke planning and Playwright route checks for detected Next.js and Vite apps
- Mock GitHub integration smoke test
- Live GitHub API verification against a real PR

Baseline verification:

- `npm test` passes: 39/39 tests.
- `npm run smoke:github-mock` passed earlier in this build cycle.
- Local CLI proof passed earlier with `--no-browser`.
- Real browser smoke passed earlier against a temporary Vite fixture.
- Real GitHub PR comment create/update was verified on `https://github.com/kingkyylian/shipproof-live-verify-20260601185438/pull/1`.

## Highest-Impact Gaps

### P0: Production Blockers

1. The ShipProof folder is not a git repository.
   - Evidence: `git status --short` fails because `/Users/kyylian/shipproof` is not a repo.
   - Impact: no real history, no branch protection, no release tag, no CI run for ShipProof itself.
   - Decision: initialize a real repo before adding more features.

2. README usage currently implies a published action that does not exist yet.
   - Evidence: README uses `kyylian/shipproof@v1`.
   - Impact: external users cannot install the product as documented.
   - Decision: either publish GitHub repo/tag quickly, or mark usage as local/self-hosted until v0.1.0.

3. Package is private.
   - Evidence: `package.json` has `"private": true`.
   - Impact: no npm install path, no `npx shipproof` path, weaker distribution.
   - Decision: keep private until repo and release hygiene are done, then flip for npm package release.

4. No product config contract exists.
   - Evidence: behavior is hardcoded in `src/core.js`, `src/browser.js`, `src/security.js`, and CLI env/args.
   - Impact: teams cannot tune required checks, route lists, score thresholds, allowlists, or monorepo package targets.
   - Decision: add `shipproof.config.json` before broad beta.

5. Report has no stable machine-readable schema.
   - Evidence: `createProofReport` returns an object internally, but only markdown is persisted.
   - Impact: hard to build dashboards, annotations, trend tracking, or regression detection later.
   - Decision: create `shipproof-report.json` and a versioned schema alongside markdown.

6. GitHub Action has not been tested as a real workflow from the ShipProof repo.
   - Evidence: live GitHub API path was verified locally; the composite action was not verified inside GitHub Actions for ShipProof itself.
   - Impact: checkout path, permissions, fork PR behavior, and artifact upload may still break in real CI.
   - Decision: dogfood the action in its own public repo immediately after repo creation.

### P1: Product Depth Gaps

7. Browser smoke is useful but too brittle for varied projects.
   - Current support: Next.js and Vite.
   - Missing: configured route maps, React Router discovery, server log artifacts, early-exit handling, custom readiness URL, configurable required/optional mode, missing Playwright policy.

8. Security-lite is intentionally shallow but lacks operational controls.
   - Missing: line numbers, allowlist with reason/expiry, SARIF output, severity overrides, baseline file, public storage/RLS heuristics, secret match redaction tests.

9. Monorepo support is missing.
   - Current behavior reads only root `package.json`.
   - Missing: workspace detection, per-package changed-file mapping, package-local commands, package-local Playwright loading.

10. CLI ergonomics are too basic.
    - Current parser is hand-rolled.
    - Missing: `--json`, `--config`, `--report-path`, `--fail-threshold`, `--help` per command, documented exit codes, deterministic debug logs.

11. Report UX needs to become merge-decision quality.
    - Current output is markdown tables.
    - Missing: collapsible details, check failure snippets, screenshot artifact references, remediation commands, "copy this prompt back to your agent" section.

12. GitHub integration is comment-only.
    - Missing: Check Run/status API support, annotations, concurrency/race handling, fork-safe degraded mode, no-token local summary mode.

13. Framework support is narrow.
    - Missing: Remix, Astro, SvelteKit, Nuxt, plain React Router, package managers beyond npm, non-Node stacks.
    - Decision: do not broaden too early. First make Next/Vite excellent.

14. No release hygiene.
    - Missing: `LICENSE`, `.gitignore`, `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md`, versioning policy, release notes, signed tags optional later.

15. No market feedback loop.
    - Missing: beta repo list, onboarding script, issue templates, feedback questions, install conversion measurement.

### P2: Later Bets

16. Hosted dashboard is premature.
    - Do only after CLI/action has repeated usage across real repos.

17. AI-generated remediation is premature.
    - First produce reliable proof and agent feedback prompts. Code-writing can stay out of scope.

18. Full SAST is not the wedge.
    - Keep security-lite focused on cheap AI-code mistakes. Integrate external scanners later instead of replacing them.

## Product Decisions

1. ShipProof stays CLI-first through v0.2.
   - Reason: the first promise is proof in a developer workflow, not a dashboard.

2. GitHub Action is the first distribution channel.
   - Reason: PR comments are where the merge decision happens.

3. Browser smoke remains a key differentiator, but missing Playwright should be configurable.
   - Default for v0.1: fail only when browser smoke is enabled and required.
   - Config should support `browser.required: false` for teams that want advisory browser checks.

4. Security-lite must be explainable.
   - Every finding should include id, severity, file, line when available, message, and suppression guidance.

5. Every report should produce two artifacts.
   - `shipproof-report.md` for humans.
   - `shipproof-report.json` for automation.

6. No SaaS until 10 real repositories have run ShipProof.
   - The dashboard should be driven by repeated report artifacts, not guesses.

## Target User

Primary:

- Solo builders and small teams using Codex, Claude Code, Cursor, OpenCode, Bolt, Lovable, Replit, or similar tools.
- They can generate code quickly but need a production-readiness gate before merge/deploy.

Critical jobs:

- "AI changed 20 files. Tell me if it is safe to merge."
- "Run the obvious checks without me wiring everything manually."
- "Open the changed UI in a browser and catch broken pages."
- "Flag risky auth/payment/database/security changes."
- "Give me the exact next prompt to send back to the coding agent."

## Roadmap

### Phase 0: Repository and Release Foundation

Goal: make ShipProof a real project that can be installed and dogfooded.

Tasks:

1. Initialize repository.
   - Add `.gitignore`.
   - Add `LICENSE`.
   - Add `CHANGELOG.md`.
   - Add `SECURITY.md`.
   - Add `CONTRIBUTING.md`.
   - Commit current MVP.

2. Create public GitHub repo.
   - Recommended repo: `kingkyylian/shipproof`.
   - Push `main`.
   - Enable GitHub Actions.

3. Dogfood ShipProof on itself.
   - Keep `.github/workflows/shipproof.yml`.
   - Open a test PR.
   - Verify the action creates/updates one PR comment.
   - Verify artifact upload works.

4. Fix README install story.
   - Before tag: document local usage with `uses: ./`.
   - After tag: document `uses: kingkyylian/shipproof@v0.1.0`.

Acceptance criteria:

- `git status --short` works from `/Users/kyylian/shipproof`.
- `npm test` passes.
- GitHub Actions runs ShipProof against its own PR.
- A public install path exists.
- README no longer promises a missing `@v1` release.

Verification commands:

```sh
git status --short
npm test
npm run smoke:github-mock
npm run shipproof -- --changed src/core.js,test/core.test.js --no-browser
```

### Phase 1: Configuration and Report Contract

Goal: make behavior configurable without editing code.

New files:

- `src/config.js`
- `test/config.test.js`
- `docs/configuration.md`
- `docs/report-schema.md`

Config file:

```json
{
  "$schema": "https://shipproof.dev/schema/v1.json",
  "checks": {
    "lint": "optional",
    "typecheck": "optional",
    "test": "required",
    "build": "required"
  },
  "browser": {
    "enabled": true,
    "required": true,
    "baseUrl": null,
    "routes": [],
    "screenshotDir": "shipproof-screenshots"
  },
  "security": {
    "enabled": true,
    "allow": []
  },
  "score": {
    "ship": 80,
    "review": 60
  }
}
```

Implementation:

- Add config loader with defaults.
- Support `--config <path>`.
- Let env/action inputs override config only for CI-specific values.
- Add JSON report writer.
- Add report schema version: `schemaVersion: "1.0"`.
- Keep markdown renderer as a view over the JSON payload.

Acceptance criteria:

- Running without config preserves current behavior.
- Running with config can disable browser smoke.
- Running with config can make browser smoke advisory.
- Running with config can override score thresholds.
- Report JSON is written next to markdown.

Verification commands:

```sh
npm test
node ./bin/shipproof.js --changed src/core.js --config ./test/fixtures/shipproof.config.json --no-browser
```

### Phase 2: GitHub Action Hardening

Goal: make CI behavior predictable in real repositories.

Files:

- `src/action.js`
- `src/github.js`
- `test/action.test.js`
- `test/github.test.js`
- `action.yml`
- `.github/workflows/shipproof.yml`

Tasks:

1. Add JSON report path input.
   - Input: `json-report-path`
   - Default: `shipproof-report.json`

2. Add degraded mode when commenting is unavailable.
   - If token lacks comment permission, still write summary and artifacts.
   - Report `commentAction: "skipped-permission"` instead of failing the entire proof.

3. Add Check Run integration behind an input.
   - Input: `check-run`
   - Default: `false` for v0.1, likely `true` later.
   - Requires `checks: write`.

4. Add concurrency safety.
   - Fetch latest comment before update.
   - Keep marker idempotence.
   - Do not create duplicate comments on reruns.

5. Document fork PR behavior.

Acceptance criteria:

- Missing comment permission does not erase the proof artifact.
- PR comment remains single-comment idempotent across reruns.
- Action can run with `comment: false`.
- Action can target GitHub Enterprise through `github-api-url`.

Verification commands:

```sh
npm test
npm run smoke:github-mock
```

### Phase 3: Browser Smoke v2

Goal: make browser proof reliable enough to trust.

Files:

- `src/browser.js`
- `test/browser.test.js`
- `docs/browser-smoke.md`

Tasks:

1. Capture dev server stdout/stderr.
   - Persist logs to `shipproof-browser-logs/`.
   - Include log paths in report.

2. Detect early server exit.
   - Fail with clear summary if dev server exits before readiness.

3. Add readiness configuration.
   - `browser.readyUrl`
   - `browser.timeoutMs`
   - `browser.waitUntil`

4. Add explicit route config.
   - Merge inferred routes with configured routes.
   - Deduplicate routes.

5. Add missing Playwright policy.
   - If `browser.enabled` and `browser.required`: fail.
   - If `browser.enabled` and not required: mark `not_checked`.
   - If disabled: skip.

6. Keep framework scope tight.
   - Improve Next/Vite first.
   - Add React Router only after route config and logging are stable.

Acceptance criteria:

- Browser failure includes route, error, screenshot directory, and server log path.
- Missing Playwright behavior follows config.
- Configured routes are checked even when inference finds none.
- Server process is stopped in success and failure paths.

Verification commands:

```sh
npm test
npm run shipproof -- --changed src/app/page.tsx --browser-base-url http://127.0.0.1:3000
```

### Phase 4: Security-Lite v2

Goal: keep fast checks, reduce false positives, and make suppressions auditable.

Files:

- `src/security.js`
- `test/security.test.js`
- `docs/security-lite.md`

Tasks:

1. Add line numbers.
   - Findings should include `line` when the match is content-based.

2. Redact secret values in all messages and fixtures.

3. Add allowlist support.
   - Allow by `id`, `file`, optional `line`, and required `reason`.
   - Optional `expiresAt`.
   - Expired allowlist entries fail.

4. Add SARIF output.
   - Optional initially.
   - Useful for GitHub security annotations later.

5. Add more AI-code-specific heuristics.
   - Supabase RLS disabled or missing policy hints.
   - Public storage bucket writes.
   - Webhook handlers missing signature verification.
   - Auth middleware bypass patterns.

Acceptance criteria:

- Findings are actionable without exposing secret values.
- Allowlisted findings remain visible but do not block if valid.
- Expired allowlists block.
- High findings still produce `no-ship`.

Verification commands:

```sh
npm test
node --test test/security.test.js
```

### Phase 5: Monorepo and Package Manager Support

Goal: make ShipProof useful in real modern repos.

Files:

- `src/workspace.js`
- `test/workspace.test.js`
- `src/core.js`
- `src/browser.js`

Tasks:

1. Detect package manager.
   - npm: `package-lock.json`
   - pnpm: `pnpm-lock.yaml`
   - yarn: `yarn.lock`
   - bun: `bun.lockb`

2. Detect workspaces.
   - `package.json#workspaces`
   - `pnpm-workspace.yaml`

3. Map changed files to package roots.

4. Run package-local checks.
   - Example: `npm --workspace app test`
   - Example: `pnpm --filter app test`

5. Load Playwright from the package that owns the changed frontend route.

Acceptance criteria:

- Single-package repos behave exactly as today.
- Monorepos run only relevant package checks by default.
- Config can force root checks.
- Browser smoke starts the correct package dev server.

Verification commands:

```sh
npm test
```

### Phase 6: Agent Feedback Loop

Goal: make ShipProof not just a gate, but the prompt that sends the coding agent back to fix the right thing.

Files:

- `src/agent-feedback.js`
- `test/agent-feedback.test.js`
- `docs/agent-feedback.md`

Report section:

```md
## Agent Feedback Prompt

Fix the ShipProof failures before merge.

Required failures:
- test: ...
- browser-smoke: /settings failed with console error ...

Risk areas:
- auth: middleware.ts changed

Do not refactor unrelated files. Re-run:
npm test
npm run shipproof -- --changed ...
```

Tasks:

- Generate concise remediation prompt from failed checks, risks, and findings.
- Add `--agent-prompt` CLI option to print only this prompt.
- Add markdown section by default when decision is `review` or `no-ship`.
- Add presets for Codex, Claude Code, Cursor, and generic agents later if needed.

Acceptance criteria:

- Failed report includes a copyable prompt.
- Passing report omits the prompt or keeps it minimal.
- Prompt includes exact commands to rerun.

Verification commands:

```sh
npm test
npm run shipproof -- --changed src/security.js --no-browser
```

### Phase 7: Beta Launch

Goal: validate repeat use before building a SaaS layer.

Tasks:

1. Create public v0.1.0 release.
   - Tag: `v0.1.0`
   - GitHub Action usage: `kingkyylian/shipproof@v0.1.0`
   - npm release optional after GitHub Action install works.

2. Prepare beta docs.
   - `README.md`
   - `docs/quickstart.md`
   - `docs/configuration.md`
   - `docs/browser-smoke.md`
   - `docs/security-lite.md`

3. Test on 10 repositories.
   - At least 4 Next.js repos.
   - At least 2 Vite repos.
   - At least 2 monorepos after Phase 5.
   - At least 2 AI-generated app repos from tools like Lovable/Bolt/Replit exports.

4. Track feedback manually.
   - Setup time.
   - False positives.
   - Browser smoke failures that were real bugs.
   - Security-lite findings that were real bugs.
   - Whether users copy the agent feedback prompt.

Acceptance criteria:

- New repo setup takes under 5 minutes.
- At least 7/10 beta repos produce useful reports without code changes.
- No duplicate PR comments across reruns.
- Users can understand `ship`, `review`, `no-ship` without explanation.

## Immediate Next 48 Hours

Recommended sequence:

1. Create repo hygiene files and commit MVP.
2. Create the public GitHub repo.
3. Push and dogfood the action on itself.
4. Fix any real workflow issues.
5. Replace README `@v1` with the real current release path.
6. Implement config/report JSON before adding more checks.

Commands:

```sh
cd /Users/kyylian/shipproof
git init
git status --short
npm test
npm run smoke:github-mock
npm run shipproof -- --changed src/core.js,test/core.test.js --no-browser
git add .
git commit -m "Initial ShipProof MVP"
gh repo create kingkyylian/shipproof --public --source=. --remote=origin --push
```

Then open a small PR and verify:

```sh
gh pr create --title "Dogfood ShipProof action" --body "Verifies ShipProof against itself."
gh pr checks --watch
gh pr view --comments
```

## Prioritized Backlog

P0:

- Repo initialization and public remote.
- README install correction.
- Real GitHub Actions dogfood run.
- Config loader.
- JSON report writer.
- Report schema docs.

P1:

- Browser smoke v2 logs and readiness.
- Security-lite line numbers and allowlist.
- GitHub degraded permissions mode.
- CLI `--json`, `--config`, and exit code docs.
- Agent feedback prompt.

P2:

- Check Run API.
- SARIF output.
- Monorepo support.
- More framework adapters.
- npm package release.

P3:

- Hosted dashboard.
- Historical trend analysis.
- Team policy management.
- Paid plan.

## Risks and Mitigations

1. Risk: setup friction kills adoption.
   - Mitigation: quickstart must fit in one workflow snippet and one config file.

2. Risk: browser smoke fails because target repo lacks Playwright.
   - Mitigation: make required/advisory behavior explicit and documented.

3. Risk: security-lite false positives create distrust.
   - Mitigation: line numbers, allowlists, clear IDs, and conservative rules.

4. Risk: PR comments become noise.
   - Mitigation: one idempotent comment, concise top decision, details collapsed later.

5. Risk: broad framework support slows the product.
   - Mitigation: make Next/Vite excellent first, route config handles the rest.

6. Risk: dashboard distracts from the wedge.
   - Mitigation: no SaaS until 10 real repos validate repeated report value.

## Definition of Done for v0.1.0

- Public GitHub repo exists.
- `v0.1.0` tag exists.
- README quickstart works from a fresh repository.
- ShipProof runs on itself in GitHub Actions.
- `npm test` passes.
- Mock GitHub smoke passes.
- PR report includes status, decision, score, checks, risks, security findings, and suggested next tests.
- High security findings block merge with `no-ship`.
- Browser smoke can be disabled or configured.
- No duplicate PR comments on rerun.

## Definition of Done for v0.2.0

- Config file is stable.
- JSON report schema is documented.
- Browser logs are captured.
- Security findings include line numbers.
- Allowlist support exists.
- Agent feedback prompt exists.
- At least 5 external/beta repositories have successful reports.

