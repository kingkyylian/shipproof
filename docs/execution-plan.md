# ShipProof Execution Plan

## Goal

Build the production-readiness layer for AI-generated code: run objective checks, classify risky changes, and show proof before a vibecoder merges or ships.

## Wedge

The first wedge is a GitHub-native proof report. A user should be able to run ShipProof locally or in CI and answer:

- Did the AI-generated change build?
- Did tests run?
- What risky areas changed?
- What should be verified next before merge?

## Four-Week Plan

### Week 1: Local CLI

- Package script discovery.
- Changed-file risk classification.
- Sequential command runner.
- Markdown proof report.
- Representative local CLI verification.

Acceptance: `npm run shipproof -- --changed <files>` runs checks and prints a useful report.

### Week 2: GitHub Action

- Add action entrypoint.
- Read PR diff from GitHub.
- Post or update PR comment.
- Upload markdown as workflow artifact.

Acceptance: a PR can run ShipProof without a hosted backend.

Current status: implemented as a composite `action.yml`, a self-test workflow in `.github/workflows/shipproof.yml`, GitHub API helper tests, and a `shipproof github` CLI mode.

### Week 3: Browser Smoke

- Detect common frontend frameworks.
- Start dev server when possible.
- Open changed or default routes with Playwright.
- Capture console errors, network failures, and screenshots.

Acceptance: UI changes get proof beyond unit tests.

Current status: implemented for Next.js and Vite detection, route inference, optional existing server reuse, Playwright route checks, console/network/page error capture, and screenshot artifacts. Runtime requires `playwright` or `@playwright/test` in the target project.

### Week 4: Risk Gates

- Add security-lite checks for env leaks, public config mistakes, unsafe CORS, and auth-sensitive file changes.
- Add `ship/no-ship` score.
- Polish PR report format.

Acceptance: ShipProof can block or warn on high-risk AI-generated changes with clear next actions.

Current status: implemented security-lite findings for committed env files, likely secrets, public client secrets, unsafe CORS, and auth-sensitive changes. Reports now include `Decision`, `Score`, security findings, and required `security-lite` proof checks. High findings fail the proof and produce `no-ship`.

## Non-Goals For MVP

- No autonomous fixing.
- No hosted dashboard.
- No broad SAST replacement claim.
- No new coding agent.

## Success Metric

A small team using AI coding agents can install ShipProof and catch at least one real broken build, failed test, missing smoke check, or risky auth/backend change before merge.
