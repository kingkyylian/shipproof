# ShipProof v0.4 Adoption Ergonomics Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. In Codex, use `executing-plans` inline unless the user explicitly asks for subagents or parallel agent work. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make first-time installation and configuration faster without weakening proof quality.

**Architecture:** Add opt-in onboarding helpers around the existing CLI and GitHub Action instead of changing proof semantics. The default proof path remains `shipproof github` for Actions and `shipproof --changed ...` locally. New ergonomics must generate explicit files, validate config before use, and stay testable without network access.

**Tech Stack:** Node.js CLI, npm package metadata, GitHub Actions YAML snippets, `node:test`, existing ShipProof config loader and report generation.

---

## File Map

- `bin/shipproof.js`: command dispatcher; add `init` only after tests define exact CLI behavior.
- `src/init.js`: create once `shipproof init` behavior is specified; owns workflow/config template generation.
- `src/config.js`: existing config loading; add validation helpers here only if they are used by runtime code.
- `test/init.test.js`: focused tests for init output, refusal to overwrite, and generated workflow content.
- `test/config.test.js`: focused tests for config validation errors and successful defaults.
- `README.md`: copy-paste install path and first-run guide.
- `docs/configuration.md`: config validation rules and examples.
- `docs/live-github-verification.md`: onboarding smoke flow after a generated workflow is committed.
- `docs/release-readiness.md`: v0.4 release evidence after the feature branch is ready.

## v0.4 Boundary

`v0.4.0` is feature work. Do not mix it into `v0.3.1` stabilization. The patch line remains limited to docs clarity, release gate lifecycle issues, pack smoke hardening, and beta-discovered regressions.

## Task 1: Define `shipproof init --dry-run`

**Files:**
- Create: `test/init.test.js`
- Modify: `bin/shipproof.js`
- Create: `src/init.js`

- [ ] **Step 1: Write the failing dry-run test**

```js
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createInitPlan } from "../src/init.js";

describe("shipproof init", () => {
  it("returns the files it would create without writing them in dry-run mode", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "shipproof-init-"));

    try {
      const plan = await createInitPlan({ root, dryRun: true });

      assert.deepEqual(plan.files.map((file) => file.path), [
        ".github/workflows/shipproof.yml",
        "shipproof.config.json"
      ]);
      assert.equal(plan.written.length, 0);
      assert.match(plan.files[0].contents, /uses: kingkyylian\/shipproof@v0\.3\.0/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```sh
node --test test/init.test.js
```

Expected: FAIL because `src/init.js` does not exist.

- [ ] **Step 3: Implement minimal `createInitPlan`**

Create `src/init.js`:

```js
export async function createInitPlan({ root, dryRun = false }) {
  const files = [
    {
      path: ".github/workflows/shipproof.yml",
      contents: [
        "name: ShipProof",
        "",
        "on:",
        "  pull_request:",
        "",
        "permissions:",
        "  contents: read",
        "  issues: write",
        "  pull-requests: write",
        "",
        "jobs:",
        "  proof:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - uses: actions/checkout@v4",
        "      - uses: kingkyylian/shipproof@v0.3.0",
        "        with:",
        "          github-token: ${{ github.token }}",
        ""
      ].join("\\n")
    },
    {
      path: "shipproof.config.json",
      contents: "{\\n  \\"browser\\": {\\n    \\"required\\": false\\n  }\\n}\\n"
    }
  ];

  if (dryRun) {
    return { root, files, written: [] };
  }

  return { root, files, written: [] };
}
```

- [ ] **Step 4: Run GREEN**

Run:

```sh
node --test test/init.test.js
```

Expected: PASS.

## Task 2: Prevent Overwrites

**Files:**
- Modify: `test/init.test.js`
- Modify: `src/init.js`

- [ ] **Step 1: Write failing overwrite test**

```js
it("refuses to overwrite existing workflow files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shipproof-init-"));
  await mkdir(path.join(root, ".github", "workflows"), { recursive: true });
  await writeFile(path.join(root, ".github", "workflows", "shipproof.yml"), "existing\\n");

  try {
    await assert.rejects(
      () => createInitPlan({ root, dryRun: false }),
      /already exists.*shipproof\.yml/i
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run RED**

Run:

```sh
node --test test/init.test.js
```

Expected: FAIL because overwrites are not checked.

- [ ] **Step 3: Add existence checks**

Use `fs.promises.stat` for each target path. Throw before writing any file when a target exists.

- [ ] **Step 4: Run GREEN**

Run:

```sh
node --test test/init.test.js
```

Expected: PASS.

## Task 3: Add Config Validation

**Files:**
- Modify: `src/config.js`
- Modify: `test/config.test.js`

- [ ] **Step 1: Write failing validation test**

```js
it("rejects invalid browser waitUntil values", async () => {
  const result = validateShipProofConfig({
    browser: {
      waitUntil: "almost-ready"
    }
  });

  assert.deepEqual(result.errors, [
    "browser.waitUntil must be one of load, domcontentloaded, networkidle, commit."
  ]);
});
```

- [ ] **Step 2: Run RED**

Run:

```sh
node --test test/config.test.js
```

Expected: FAIL because `validateShipProofConfig` does not exist.

- [ ] **Step 3: Implement validation**

Export `validateShipProofConfig(config)` from `src/config.js`. It returns `{ errors: [] }` for valid config and never mutates input.

- [ ] **Step 4: Run GREEN**

Run:

```sh
node --test test/config.test.js
```

Expected: PASS.

## Task 4: README First-Run Path

**Files:**
- Modify: `README.md`
- Modify: `docs/configuration.md`

- [ ] **Step 1: Add copy-paste install section**

Add this under `## GitHub Action`:

````md
### First-Time Setup

Use the published action in pull request workflows:

```yaml
- uses: kingkyylian/shipproof@v0.3.0
  with:
    github-token: ${{ github.token }}
```
````

- [ ] **Step 2: Add config validation docs**

Document valid browser `waitUntil` values:

```txt
load
domcontentloaded
networkidle
commit
```

- [ ] **Step 3: Verify docs**

Run:

```sh
npm run release:readiness
git diff --check
```

Expected: both pass.

## Task 5: v0.4 Release Gate

**Files:**
- Modify: `CHANGELOG.md`
- Create: `docs/release-notes/v0.4.0.md`
- Modify: `docs/release-readiness.md`
- Modify: `scripts/release-readiness.mjs`
- Modify: `test/release-readiness.test.js`

- [ ] **Step 1: Do not start until v0.4 features are merged**

Run:

```sh
git status --short --branch
```

Expected: clean `main...origin/main` after v0.4 feature PRs merge.

- [ ] **Step 2: Prepare release-candidate metadata**

Update package metadata to `0.4.0`, generate `docs/release-notes/v0.4.0.md` from `CHANGELOG.md`, and update docs action references to `kingkyylian/shipproof@v0.4.0`.

- [ ] **Step 3: Run final gates**

Run:

```sh
npm test
npm run release:readiness
npm run pack:smoke -- --clean
npm pack --dry-run --json
npm audit --omit=dev
git diff --check
```

Expected: all pass.

Do not tag `v0.4.0`, create a GitHub release, or publish to npm without explicit approval for that exact action.
