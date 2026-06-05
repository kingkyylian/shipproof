# ShipProof v0.3.1 Stabilization and npm Readiness Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. In Codex, use `executing-plans` inline unless the user explicitly asks for subagents or parallel agent work. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the live `v0.3.0` GitHub Action release, prepare a patch-safe `v0.3.1` line, and make npm publishing auditable without publishing to npm.

**Architecture:** Keep GitHub Action releases and npm registry publishing as separate approval gates. Stabilization work may update docs, tests, release gates, and smoke tooling, but must not remove `package.json#private` or add a publishing workflow. npm publishing readiness is proven through static policy checks, local dry-runs, and a future dedicated publishing PR.

**Tech Stack:** Node.js test runner, npm package metadata, GitHub Actions composite action, `gh` CLI, ShipProof release gates.

---

## File Map

- `docs/npm-publishing.md`: source of truth for npm publishing policy, blockers, dry-run requirements, and rollback/deprecation plan.
- `scripts/release-readiness.mjs`: local release gate that prevents stale release and publishing docs.
- `test/release-readiness.test.js`: regression tests for release and publish policy drift.
- `docs/post-release-observations.md`: v0.3.0 live-action observation log for real PR runs and edge cases.
- `docs/release-readiness.md`: latest release evidence and approval boundary.
- `docs/checkpoints/*.md`: resumable checkpoints after each stabilization tranche.
- `README.md`: user-facing install path and current release-line wording.
- `.github/workflows/*.yml`: future trusted publishing workflow location; do not create until npm publishing is explicitly approved.

## Task 1: Lock npm Publishing Docs to the Current Action Release

**Files:**
- Modify: `test/release-readiness.test.js`
- Modify: `scripts/release-readiness.mjs`
- Modify: `docs/npm-publishing.md`

- [x] **Step 1: Write the failing test**

```js
it("detects stale npm publishing docs", async () => {
  const { checkReleaseReadiness } = await import(releaseModuleUrl);
  const fixture = await createReleaseFixture({
    npmPublishing: createNpmPublishingDoc().replace(
      "kingkyylian/shipproof@v0.3.0",
      "kingkyylian/shipproof@v0.2.0"
    )
  });

  try {
    const result = await checkReleaseReadiness({ root: fixture });

    assert.match(result.errors.join("\n"), /docs\/npm-publishing\.md.*kingkyylian\/shipproof@v0\.3\.0/i);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test test/release-readiness.test.js`

Expected: FAIL because `scripts/release-readiness.mjs` does not yet inspect `docs/npm-publishing.md`.

- [x] **Step 3: Implement the gate**

Add `checkNpmPublishingDoc(root, tag, errors)` to `scripts/release-readiness.mjs`. It must require:

```txt
kingkyylian/shipproof@v0.3.0
`package.json#private` is `true`
`npm publish --dry-run`
Rollback and Deprecation Plan
```

- [x] **Step 4: Update publishing docs**

Update `docs/npm-publishing.md` so current state says:

```txt
GitHub Action distribution is live at `kingkyylian/shipproof@v0.3.0`.
```

Add a `v0.3.1 Stabilization First` section that keeps npm publish behind a separate approval.

- [x] **Step 5: Verify green**

Run:

```sh
node --test test/release-readiness.test.js
```

Expected: PASS, 11/11 release-readiness tests.

## Task 2: Start the v0.3.0 Post-Release Observation Log

**Files:**
- Create: `docs/post-release-observations.md`
- Modify: `docs/release-readiness.md`
- Test: no code test; verify with `npm run release:readiness` and `git diff --check`

- [x] **Step 1: Create observation log**

Create `docs/post-release-observations.md`:

```md
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
```

- [x] **Step 2: Link from release readiness**

Add this bullet under `Post-Release Verification - 2026-06-05` in `docs/release-readiness.md`:

```md
- Post-release observations are tracked in `docs/post-release-observations.md`.
```

- [x] **Step 3: Verify docs**

Run:

```sh
npm run release:readiness
git diff --check
```

Expected: both pass.

## Task 3: Prepare the v0.3.1 Patch Scope

**Files:**
- Create: `docs/release-notes/v0.3.1.md`
- Modify: `CHANGELOG.md`
- Modify: `scripts/release-readiness.mjs`
- Modify: `test/release-readiness.test.js`

- [ ] **Step 1: Write version-override test**

Add a test that calls:

```js
const result = await checkReleaseReadiness({ root: fixture, version: "0.3.1" });
```

Expected fixture changes:

```txt
package.json version: 0.3.1
package-lock root version: 0.3.1
docs/release-notes/v0.3.1.md exists
docs references remain kingkyylian/shipproof@v0.3.1 for release-candidate docs
```

- [ ] **Step 2: Run RED**

Run:

```sh
node --test test/release-readiness.test.js
```

Expected: FAIL until fixture helpers can produce `0.3.1` release docs.

- [ ] **Step 3: Implement fixture support only**

Refactor test fixture helpers to accept a `version` override. Do not change package version in real files yet.

- [ ] **Step 4: Verify GREEN**

Run:

```sh
node --test test/release-readiness.test.js
```

Expected: PASS.

- [ ] **Step 5: Draft v0.3.1 scope**

Create `docs/release-notes/v0.3.1.md` only when a real patch change exists. Do not create an empty release-note file.

## Task 4: npm Publishing PR Preflight, No Publish

**Files:**
- Modify: `docs/npm-publishing.md`
- Create only after explicit publish-readiness approval: `.github/workflows/npm-publish.yml`
- Modify only in dedicated publishing PR: `package.json`

- [ ] **Step 1: Confirm blockers remain explicit**

Run:

```sh
node -e "const p=require('./package.json'); console.log(JSON.stringify({private:p.private, version:p.version}, null, 2));"
```

Expected:

```json
{
  "private": true,
  "version": "0.3.0"
}
```

- [ ] **Step 2: Run local dry-runs**

Run:

```sh
npm run pack:smoke -- --clean
npm pack --dry-run --json
npm run publish:dry-run
```

Expected: all pass; `npm run publish:dry-run` prints `+ shipproof@0.3.0` and does not publish.

- [ ] **Step 3: Do not remove privacy**

Do not edit:

```json
"private": true
```

until a separate user approval explicitly allows npm publishing preparation.

## Task 5: v0.4 Adoption Ergonomics Planning

**Files:**
- Create: `docs/superpowers/plans/YYYY-MM-DD-shipproof-v0.4-adoption-ergonomics.md`
- No production code in this task.

- [x] **Step 1: Define one v0.4 theme**

Use this goal:

```txt
Make first-time installation and configuration faster without weakening proof quality.
```

- [x] **Step 2: Split candidate work**

Include these candidate tasks:

```txt
shipproof init
workflow generator
config validation
first-run report clarity
copy-paste install docs
```

- [x] **Step 3: Keep v0.4 separate from v0.3.1**

State explicitly that v0.3.1 is patch-safe stabilization and v0.4 is feature work.

## Final Verification for Each PR

Run:

```sh
npm test
npm run release:readiness
npm run pack:smoke -- --clean
npm pack --dry-run --json
npm audit --omit=dev
git diff --check
```

Do not run `npm publish` without explicit approval. `npm run publish:dry-run` is allowed and remains a dry-run only.
