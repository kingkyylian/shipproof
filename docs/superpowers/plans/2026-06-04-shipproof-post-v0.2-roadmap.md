# ShipProof Post-v0.2 Roadmap Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. In Codex, use `executing-plans` inline unless the user explicitly asks for subagents or parallel agent work. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the released `v0.2.0` GitHub Action into a stable, repeatable product with stronger adoption evidence, npm readiness, richer PR feedback, and a clear path to `v0.3.0`.

**Architecture:** Keep ShipProof CLI-first and GitHub Action-first. Treat `src/core.js` as the report/proof engine, `src/action.js` as GitHub workflow orchestration, `src/browser.js` as browser smoke runtime, `src/security.js` as security-lite runtime, and `scripts/release-readiness.mjs` as the release contract gate.

**Tech Stack:** Node.js ESM, built-in `node:test`, GitHub Actions composite action, GitHub CLI, npm packaging, Playwright-compatible browser smoke checks.

---

## Current Baseline

- `v0.2.0` tag is live at `9e1f1b11f6f34f677dd445a58f69481523959987`.
- GitHub release is live: `https://github.com/kingkyylian/shipproof/releases/tag/v0.2.0`.
- Published action dogfood succeeded through PR #9 and run `26881315207`.
- Post-release housekeeping PR #10 is merged.
- `main` is clean and tracks `origin/main`.
- `package.json#private` remains `true`; npm publishing is intentionally not done.

## Strategic Principles

- Keep the GitHub Action as the primary distribution channel until npm publishing has a dedicated release spec.
- Do not add a hosted dashboard before at least 10 real repositories produce useful ShipProof reports.
- Prefer hardening existing report, browser, security, and GitHub workflows over broad framework expansion.
- Every product change gets a focused test, a real local gate, and one GitHub dogfood PR before release.
- Every release candidate must pass `npm test`, `npm run release:readiness`, `npm run pack:smoke -- --clean`, `npm pack --dry-run`, `npm audit --omit=dev`, and a ShipProof self-proof.

---

## Phase 1: Release Operations Hardening

**Outcome:** The next release is less manual and easier to audit.

**Files:**
- Modify: `docs/release-readiness.md`
- Modify: `scripts/release-readiness.mjs`
- Modify: `test/release-readiness.test.js`
- Create: `docs/release-process.md`
- Create: `scripts/post-release-verify.mjs`
- Create: `test/post-release-verify.test.js`

### Task 1: Document the Release Process

- [ ] Create `docs/release-process.md` with the exact release sequence:

```md
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
   `git ls-remote --tags origin "vX.Y.Z*"`
   `gh release view vX.Y.Z --json tagName,name,url,isDraft,isPrerelease,publishedAt,targetCommitish`
5. Open a temporary dogfood PR that uses `kingkyylian/shipproof@vX.Y.Z`.
6. Verify workflow success, PR comment, Markdown artifact, JSON artifact, and SARIF artifact.
7. Close the dogfood PR without merge.
```

- [ ] Run `git diff -- docs/release-process.md`.
- [ ] Commit with `git commit -m "Document release process"`.

### Task 2: Add Post-Release Verification Script

- [ ] Write a failing test in `test/post-release-verify.test.js`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const moduleUrl = pathToFileURL(path.join(repoRoot, "scripts", "post-release-verify.mjs")).href;

describe("post release verification", () => {
  it("parses release verification JSON from command output", async () => {
    const { parseReleaseView } = await import(moduleUrl);

    const parsed = parseReleaseView(JSON.stringify({
      tagName: "v0.2.0",
      name: "ShipProof v0.2.0",
      url: "https://github.com/kingkyylian/shipproof/releases/tag/v0.2.0",
      isDraft: false,
      isPrerelease: false,
      publishedAt: "2026-06-03T11:17:35Z",
      targetCommitish: "main"
    }));

    assert.equal(parsed.tagName, "v0.2.0");
    assert.equal(parsed.isDraft, false);
    assert.equal(parsed.isPrerelease, false);
  });
});
```

- [ ] Run `node --test test/post-release-verify.test.js`.
- [ ] Expect failure because `scripts/post-release-verify.mjs` does not exist.
- [ ] Create `scripts/post-release-verify.mjs`:

```js
import { fileURLToPath } from "node:url";
import path from "node:path";

export function parseReleaseView(stdout) {
  const parsed = JSON.parse(stdout);

  return {
    tagName: parsed.tagName,
    name: parsed.name,
    url: parsed.url,
    isDraft: parsed.isDraft,
    isPrerelease: parsed.isPrerelease,
    publishedAt: parsed.publishedAt,
    targetCommitish: parsed.targetCommitish
  };
}

function parseArgs(argv) {
  const parsed = { version: "", errors: [] };

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--version") {
      parsed.version = argv[index + 1] ?? "";
      index += 1;
    } else {
      parsed.errors.push(`Unknown argument: ${argv[index]}`);
    }
  }

  if (!parsed.version) {
    parsed.errors.push("--version requires a value.");
  }

  return parsed;
}

async function runCli(argv) {
  const parsed = parseArgs(argv);

  if (parsed.errors.length > 0) {
    for (const error of parsed.errors) {
      console.error(`- ${error}`);
    }
    return 1;
  }

  console.log(`Run these checks for v${parsed.version}:`);
  console.log(`git ls-remote --tags origin "v${parsed.version}*"`);
  console.log(`gh release view v${parsed.version} --json tagName,name,url,isDraft,isPrerelease,publishedAt,targetCommitish`);
  return 0;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  process.exitCode = await runCli(process.argv.slice(2));
}
```

- [ ] Run `node --test test/post-release-verify.test.js`.
- [ ] Run `npm test`.
- [ ] Commit with `git commit -m "Add post-release verification helper"`.

---

## Phase 2: External Adoption Evidence

**Outcome:** ShipProof has evidence from at least 10 real repositories and a repeatable beta feedback loop.

**Files:**
- Modify: `docs/beta-test-matrix.md`
- Create: `docs/beta-feedback.md`
- Create: `scripts/beta-report-audit.mjs`
- Create: `test/beta-report-audit.test.js`

### Task 3: Define Beta Feedback Contract

- [ ] Create `docs/beta-feedback.md`:

```md
# ShipProof Beta Feedback

For each beta repository, record:

- repository path or URL
- project shape
- changed files used for the proof
- package manager
- checks discovered
- report status
- decision
- score
- security findings count
- browser smoke behavior
- false positives
- false negatives
- UX notes
- artifact paths or GitHub run URL

Minimum acceptance for v0.3.0:

- 10 successful reports across real repositories
- 2 failing reports that correctly block a bad merge
- 2 browser-smoke reports with real screenshots
- 2 monorepo reports
- 1 fork/permission-degraded GitHub PR scenario
```

- [ ] Add a `v0.3 Evidence Targets` section to `docs/beta-test-matrix.md`.
- [ ] Run `git diff -- docs/beta-feedback.md docs/beta-test-matrix.md`.
- [ ] Commit with `git commit -m "Define beta feedback contract"`.

### Task 4: Add Beta Report Audit Parser

- [ ] Create `test/beta-report-audit.test.js` with a failing parser test:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const moduleUrl = pathToFileURL(path.join(repoRoot, "scripts", "beta-report-audit.mjs")).href;

describe("beta report audit", () => {
  it("summarizes proof report JSON", async () => {
    const { summarizeReport } = await import(moduleUrl);

    const summary = summarizeReport({
      schemaVersion: "1.0",
      status: "passed",
      decision: "ship",
      score: 94,
      checks: [{ name: "test" }, { name: "security-lite" }],
      securityFindings: []
    });

    assert.deepEqual(summary, {
      schemaVersion: "1.0",
      status: "passed",
      decision: "ship",
      score: 94,
      checkCount: 2,
      securityFindings: 0
    });
  });
});
```

- [ ] Run `node --test test/beta-report-audit.test.js`.
- [ ] Expect failure because `scripts/beta-report-audit.mjs` does not exist.
- [ ] Create `scripts/beta-report-audit.mjs`:

```js
export function summarizeReport(report) {
  return {
    schemaVersion: report.schemaVersion,
    status: report.status,
    decision: report.decision,
    score: report.score,
    checkCount: Array.isArray(report.checks) ? report.checks.length : 0,
    securityFindings: Array.isArray(report.securityFindings) ? report.securityFindings.length : 0
  };
}
```

- [ ] Run `node --test test/beta-report-audit.test.js`.
- [ ] Run `npm test`.
- [ ] Commit with `git commit -m "Add beta report audit parser"`.

---

## Phase 3: GitHub PR Feedback v2

**Outcome:** ShipProof reports are easier to act on inside PRs.

**Files:**
- Modify: `src/core.js`
- Modify: `src/action.js`
- Modify: `test/core.test.js`
- Modify: `test/action.test.js`
- Modify: `docs/report-schema.md`
- Modify: `README.md`

### Task 5: Add Report Summary Block for PR Scanning

- [ ] Add a failing test in `test/core.test.js` that asserts Markdown includes a compact `## Merge Signal` section with status, decision, score, failed checks count, security findings count, and artifact list.
- [ ] Run `node --test test/core.test.js`.
- [ ] Implement the Markdown section in `src/core.js` in the existing report renderer.
- [ ] Run `node --test test/core.test.js`.
- [ ] Run `npm test`.
- [ ] Update `docs/report-schema.md` and `README.md` with the new report shape.
- [ ] Commit with `git commit -m "Add merge signal report section"`.

### Task 6: Add GitHub Step Summary Contract Test

- [ ] Add a test in `test/action.test.js` proving `appendSummary` receives the same Markdown body written to the PR comment.
- [ ] Run `node --test test/action.test.js`.
- [ ] Fix `src/action.js` only if the test reveals drift.
- [ ] Run `npm test`.
- [ ] Commit with `git commit -m "Test GitHub step summary contract"`.

---

## Phase 4: Browser Smoke Reliability

**Outcome:** Browser smoke failures are easier to diagnose and less flaky.

**Files:**
- Modify: `src/browser.js`
- Modify: `test/browser.test.js`
- Modify: `docs/browser-smoke.md`
- Modify: `docs/configuration.md`

### Task 7: Capture Last Server Log Lines on Startup Failure

- [ ] Add a test in `test/browser.test.js` where `startDevServer` times out and returns a summary containing the last stderr line.
- [ ] Run `node --test test/browser.test.js`.
- [ ] Modify `src/browser.js` to retain the last 20 stdout/stderr lines while writing full logs to disk.
- [ ] Run `node --test test/browser.test.js`.
- [ ] Run `npm test`.
- [ ] Update `docs/browser-smoke.md` with the diagnostic behavior.
- [ ] Commit with `git commit -m "Include browser server log excerpts"`.

### Task 8: Add Browser Route Failure JSON Details

- [ ] Add a `browserRoutes` array to report JSON when browser smoke runs.
- [ ] Add tests in `test/browser.test.js` and `test/core.test.js`.
- [ ] Document fields in `docs/report-schema.md`: route, status, screenshot, errors.
- [ ] Run `npm test`.
- [ ] Commit with `git commit -m "Expose browser route results in JSON"`.

---

## Phase 5: Security-Lite v3

**Outcome:** Security-lite catches more AI-code mistakes without becoming a full SAST product.

**Files:**
- Modify: `src/security.js`
- Modify: `test/security.test.js`
- Modify: `docs/security-lite.md`
- Modify: `docs/configuration.md`

### Task 9: Add Public Storage and RLS Heuristics

- [ ] Add tests in `test/security.test.js` for:
  - public Supabase bucket policy in SQL
  - disabled RLS on a table
  - broad `anon` write policy
- [ ] Run `node --test test/security.test.js`.
- [ ] Add focused rules in `src/security.js` with IDs:
  - `public-storage-policy`
  - `rls-disabled`
  - `broad-anon-write`
- [ ] Run `node --test test/security.test.js`.
- [ ] Update `docs/security-lite.md`.
- [ ] Run `npm test`.
- [ ] Commit with `git commit -m "Add Supabase security-lite heuristics"`.

### Task 10: Add Severity Override Config

- [ ] Add tests proving `shipproof.config.json` can downgrade or upgrade a finding severity by ID.
- [ ] Modify `src/config.js` and `src/security.js`.
- [ ] Document exact config shape:

```json
{
  "security": {
    "severity": {
      "unsafe-cors": "medium",
      "public-storage-policy": "high"
    }
  }
}
```

- [ ] Run `npm test`.
- [ ] Commit with `git commit -m "Support security severity overrides"`.

---

## Phase 6: npm Publishing Readiness

**Outcome:** npm can be enabled later with a low-risk, separately approved release.

**Files:**
- Create: `docs/npm-publishing.md`
- Create: `.github/workflows/npm-publish.yml` only after trusted publishing policy is chosen.
- Modify: `package.json` only in the npm publishing PR.
- Modify: `scripts/release-readiness.mjs` after npm publishing becomes part of the release gate.

### Task 11: Write npm Publishing Spec Without Publishing

- [ ] Create `docs/npm-publishing.md`:

```md
# ShipProof npm Publishing Plan

## Current State

- `package.json#private` is `true`.
- GitHub Action distribution is live at `kingkyylian/shipproof@v0.2.0`.
- npm publishing is not part of the current release channel.

## Required Decisions

- Use npm trusted publishing from GitHub Actions.
- Keep GitHub Action release and npm package release on the same version.
- Require `npm publish --dry-run` before publish.
- Require post-publish smoke with `npx shipproof --help` or `npm exec shipproof -- --help`.

## Do Not Do

- Do not remove `private: true` outside the npm publishing PR.
- Do not publish from a local machine unless trusted publishing is explicitly rejected.
- Do not publish without a rollback/deprecation plan.
```

- [ ] Run `git diff -- docs/npm-publishing.md`.
- [ ] Commit with `git commit -m "Document npm publishing plan"`.

### Task 12: Add npm Dry-Run Gate

- [ ] Add a script entry only when ready:

```json
{
  "scripts": {
    "publish:dry-run": "npm publish --dry-run"
  }
}
```

- [ ] Run `npm run publish:dry-run`.
- [ ] Confirm it does not publish because it is a dry run.
- [ ] Keep package private until the dedicated publish approval.
- [ ] Commit with `git commit -m "Add npm publish dry-run gate"`.

---

## Phase 7: v0.3.0 Release Candidate

**Outcome:** ShipProof has a clean next public milestone.

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `CHANGELOG.md`
- Create: `docs/release-notes/v0.3.0.md`
- Modify: `docs/release-readiness.md`
- Modify: `scripts/release-readiness.mjs`
- Modify: `test/release-readiness.test.js`

### Task 13: Prepare v0.3.0 Release Contract

- [ ] Bump `package.json` and `package-lock.json` to `0.3.0`.
- [ ] Add `## 0.3.0 - YYYY-MM-DD` to `CHANGELOG.md` after the release scope is known.
- [ ] Generate `docs/release-notes/v0.3.0.md` from that changelog section.
- [ ] Update `scripts/release-readiness.mjs` default version to `0.3.0`.
- [ ] Update `test/release-readiness.test.js` fixtures to `0.3.0`.
- [ ] Run:

```sh
npm test
npm run release:readiness
npm run pack:smoke -- --clean
npm pack --dry-run
npm audit --omit=dev
git diff --check
```

- [ ] Open PR and dogfood through GitHub Actions.
- [ ] Merge only after PR proof check succeeds.
- [ ] Tag and release only after explicit release approval.

---

## Recommended Execution Order

1. Phase 1: release operations hardening.
2. Phase 2: beta evidence loop.
3. Phase 3: PR feedback v2.
4. Phase 4: browser reliability.
5. Phase 5: security-lite v3.
6. Phase 6: npm publishing readiness spec.
7. Phase 7: v0.3.0 release candidate.

## Commit and PR Policy

- One phase per PR.
- Prefer one commit per task when the task changes behavior.
- Always run the nearest targeted test before full `npm test`.
- Always let the ShipProof GitHub Action proof check run on the PR.
- Do not create tags, GitHub releases, npm publishes, or repo metadata changes without explicit approval for that exact action.

## Completion Criteria for This Roadmap

- At least 10 external beta reports are recorded.
- Browser smoke diagnostics include actionable server log excerpts.
- Security-lite catches Supabase/RLS mistakes.
- PR reports include a compact merge signal.
- npm publishing has a written, reviewed plan even if still disabled.
- `v0.3.0` has a release contract and release notes before approval.
