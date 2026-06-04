# ShipProof Beta Test Matrix - 2026-06-02

This matrix records local beta runs against real repositories. The current entries supported the `v0.2.0` release; new entries should follow the feedback contract in `docs/beta-feedback.md` and count toward the `v0.3.0` evidence targets below.

## Scope

- ShipProof was run from `/Users/kyylian/shipproof/bin/shipproof.js`.
- Most command reports used `--no-browser` to focus on command discovery, report status, score/decision behavior, JSON artifacts, security-lite, and SARIF output.
- One browser advisory run started a Vite dev server and verified missing-Playwright handling with `browser.required: false`.
- One hermetic Playwright-enabled fixture ran a required browser smoke and produced a real Chromium screenshot.
- Target repositories were not cleaned or reverted. Pre-existing dirty worktrees are noted below.
- JSON and SARIF artifacts were written under `/private/tmp`.

## Successful External Reports

| Repo | Shape | Changed Scope | Result | Checks | Artifacts |
| --- | --- | --- | --- | --- | --- |
| `/Users/kyylian/Developer/trustq` | Node backend | `src/server.js,package.json` | passed, ship, score 88 | `test`, `security-lite` | `/private/tmp/shipproof-beta-trustq.json`, `/private/tmp/shipproof-beta-trustq.sarif` |
| `/Users/kyylian/Developer/net-cafe-system/admin-web` | Vite admin frontend | `src/main.tsx,package.json` | passed, ship, score 94 | `lint`, `build`, `security-lite` | `/private/tmp/shipproof-beta-admin-web.json`, `/private/tmp/shipproof-beta-admin-web.sarif` |
| `/Users/kyylian/Developer/cvboost` | Next.js app | `app/page.tsx,package.json` | passed, ship, score 94 | `lint`, `test`, `build`, `security-lite` | `/private/tmp/shipproof-beta-cvboost.json`, `/private/tmp/shipproof-beta-cvboost.sarif` |
| `/Users/kyylian/Developer/unity-apple-scaffold-agent` | TypeScript CLI | `src/cli.ts,package.json` | passed, ship, score 94 | `typecheck`, `test`, `build`, `security-lite` | `/private/tmp/shipproof-beta-unity-apple-scaffold-agent.json`, `/private/tmp/shipproof-beta-unity-apple-scaffold-agent.sarif` |
| `/Users/kyylian/handoffkit` | pnpm TypeScript CLI/library | `src/cli/index.ts,package.json` | passed, ship, score 94 | `lint`, `typecheck`, `test`, `build`, `security-lite` | `/private/tmp/shipproof-beta-handoffkit.json`, `/private/tmp/shipproof-beta-handoffkit.sarif` |
| `/Users/kyylian/Developer/tcli` | pnpm monorepo CLI workspace | `apps/cli/src/cli.ts,apps/cli/package.json` | passed, ship, score 100 | `tcli:typecheck`, `tcli:test`, `tcli:build`, `security-lite` | `/private/tmp/shipproof-beta-tcli-monorepo.json`, `/private/tmp/shipproof-beta-tcli-monorepo.sarif` |

All six successful SARIF artifacts parsed as SARIF `2.1.0` with zero results.

## Browser Advisory Report

| Repo | Shape | Changed Scope | Result | Browser Behavior | Artifacts |
| --- | --- | --- | --- | --- | --- |
| `/Users/kyylian/Developer/net-cafe-system/admin-web` | Vite admin frontend | `src/main.tsx,package.json` | passed, ship, score 94 | `browser-smoke` was `not_checked` because Playwright is not installed and `browser.required` was `false`; lint, build, and security-lite passed | `/private/tmp/shipproof-beta-admin-web-browser-advisory.json`, `/private/tmp/shipproof-beta-admin-web-browser-advisory.sarif`, `/private/tmp/shipproof-browser-beta-admin-web-logs` |

The advisory browser run verified:

- Vite dev server startup and readiness polling;
- dev server log artifact capture under `/private/tmp/shipproof-browser-beta-admin-web-logs`;
- missing Playwright reported as `not_checked` instead of a hard failure when browser smoke is advisory;
- local `--screenshot-dir` and `--browser-log-dir` artifact paths are preserved in the JSON report.

## Playwright Required Render Report

| Target | Shape | Changed Scope | Result | Browser Behavior | Artifacts |
| --- | --- | --- | --- | --- | --- |
| `/private/tmp/shipproof-playwright-fixture-20260602-2058` | hermetic Vite-detected fixture | `src/App.tsx` | passed, ship, score 100 | `browser-smoke` launched real Chromium, opened `/`, captured `home.png`, and stopped the dev server | `/private/tmp/shipproof-beta-playwright-fixture.json`, `/private/tmp/shipproof-beta-playwright-fixture.sarif`, `/private/tmp/shipproof-playwright-fixture-screens/home.png`, `/private/tmp/shipproof-playwright-fixture-logs` |

The required Playwright render run verified:

- target-project Playwright resolution through `@playwright/test`;
- Chromium launch with the installed browser cache;
- Vite-style dev server startup and readiness polling;
- route screenshot capture as a 1280 x 720 PNG;
- server log artifact capture;
- required browser smoke failure behavior first caught a missing browser cache revision, then passed after the matching Chromium revision was installed.

## Failure Example

| Repo | Shape | Changed Scope | Result | Finding | Artifacts |
| --- | --- | --- | --- | --- | --- |
| `/Users/kyylian/Developer/portfolio` | Next.js portfolio | `src/app/page.tsx,package.json` | failed, no-ship, score 79 | `npm run lint` failed on `react-hooks/set-state-in-effect`; build and security-lite passed | `/private/tmp/shipproof-beta-portfolio.json`, `/private/tmp/shipproof-beta-portfolio.sarif` |

The portfolio run initially exposed a ShipProof correctness issue: a failed executed `lint` check could still produce `passed` and `ship` because `lint` was configured as optional. The fixed behavior is:

- any executed `failed` check marks the proof `failed`;
- optional failures do not stop later checks;
- failed optional checks reduce score;
- the final decision becomes `no-ship`;
- rerun commands and an agent feedback prompt are emitted.

The corrected portfolio rerun exited non-zero and produced `failed`, `no-ship`, score `79`, rerun command `npm run lint`, and a non-empty agent feedback prompt.

## Product Fixes From The Matrix

- Root package-manager detection now applies to single-package repositories, not only workspaces. HandoffKit verified `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- Browser smoke root dev commands now use the detected package manager, not hard-coded `npm`.
- Failed executed optional checks no longer produce clean `ship` reports. Optional means the failure does not short-circuit later command checks; it does not mean a failed check can be ignored.
- Local browser artifact flags now override default config paths in the report.
- Required browser smoke was verified with a real Chromium render in a hermetic fixture.

## v0.3 Evidence Targets

Before `v0.3.0`, record:

- 10 successful reports across real repositories.
- 2 failing reports that correctly block a bad merge.
- 2 browser-smoke reports with real screenshots.
- 2 monorepo reports.
- 1 fork or permission-degraded GitHub PR scenario.

Current counted evidence:

| Target | Count | Evidence |
| --- | ---: | --- |
| Successful real-repository reports | 6 / 10 | `trustq`, `admin-web`, `cvboost`, `unity-apple-scaffold-agent`, `handoffkit`, `tcli` |
| Correct blocking failure reports | 1 / 2 | `portfolio` lint failure produced failed/no-ship |
| Browser screenshots | 1 / 2 | Playwright fixture produced `home.png` |
| Monorepo reports | 1 / 2 | `tcli` pnpm workspace report |
| Fork or permission-degraded PR scenarios | 0 / 1 | Pending |

## Worktree Notes

- `handoffkit` remained clean after the beta run.
- `trustq`, `admin-web`, `cvboost`, `unity-apple-scaffold-agent`, `portfolio`, and `tcli` already had user-owned dirty worktrees or untracked metadata before these beta checks. Those changes were left untouched.
- Build outputs created by beta runs were ignored by target repositories where applicable and were not cleaned manually.

## Current Gaps

- A product-repo Playwright browser matrix is still pending because no local Next/Vite beta candidate in this pass had `playwright` or `@playwright/test` installed.
- Additional large monorepo coverage remains useful, but `tcli` now covers pnpm workspace package mapping for a real CLI workspace.
- `v0.2.0` is released, but the v0.3 matrix still needs more real-repository and GitHub PR evidence.
- Npm publishing remains out of scope until package privacy, auth, and trusted publishing policy are decided.
