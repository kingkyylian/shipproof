import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const releaseModuleUrl = pathToFileURL(path.join(repoRoot, "scripts", "release-readiness.mjs")).href;

describe("release readiness gate", () => {
  it("passes the current v0.3.0 release contract", async () => {
    const { checkReleaseReadiness } = await import(releaseModuleUrl);

    const result = await checkReleaseReadiness({ root: repoRoot });

    assert.deepEqual(result.errors, []);
    assert.equal(result.version, "0.3.0");
  });

  it("detects release notes that drift from the changelog section", async () => {
    const { checkReleaseReadiness } = await import(releaseModuleUrl);
    const fixture = await createReleaseFixture({
      releaseNotes: [
        "# ShipProof v0.3.0",
        "",
        "### Added",
        "",
        "- A stale release note.",
        ""
      ].join("\n")
    });

    try {
      const result = await checkReleaseReadiness({ root: fixture });

      assert.match(result.errors.join("\n"), /release notes.*CHANGELOG\.md/i);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  it("detects missing GitHub Action input env wiring", async () => {
    const { checkReleaseReadiness } = await import(releaseModuleUrl);
    const fixture = await createReleaseFixture({
      actionYaml: createActionYaml().replace("INPUT_SCREENSHOT_DIR: ${{ inputs.screenshot-dir }}", "")
    });

    try {
      const result = await checkReleaseReadiness({ root: fixture });

      assert.match(result.errors.join("\n"), /screenshot-dir.*INPUT_SCREENSHOT_DIR/i);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  it("detects package lockfile version drift", async () => {
    const { checkReleaseReadiness } = await import(releaseModuleUrl);
    const fixture = await createReleaseFixture({
      packageLock: createPackageLock({ version: "0.1.0" })
    });

    try {
      const result = await checkReleaseReadiness({ root: fixture });

      assert.match(result.errors.join("\n"), /package-lock\.json.*0\.3\.0/i);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  it("detects package bin entrypoint drift", async () => {
    const { checkReleaseReadiness } = await import(releaseModuleUrl);
    const fixture = await createReleaseFixture({
      packageJson: createPackageJson({
        bin: {
          shipproof: "./dist/shipproof.js"
        }
      })
    });

    try {
      const result = await checkReleaseReadiness({ root: fixture });

      assert.match(result.errors.join("\n"), /bin\.shipproof.*bin\/shipproof\.js/i);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  it("detects missing npm publish dry-run gate", async () => {
    const { checkReleaseReadiness } = await import(releaseModuleUrl);
    const fixture = await createReleaseFixture({
      packageJson: createPackageJson({
        scripts: {
          test: "node --test",
          "smoke:github-mock": "node scripts/mock-github-smoke.mjs",
          "pack:smoke": "node scripts/pack-smoke.mjs",
          "release:readiness": "node scripts/release-readiness.mjs",
          shipproof: "node ./bin/shipproof.js"
        }
      })
    });

    try {
      const result = await checkReleaseReadiness({ root: fixture });

      assert.match(result.errors.join("\n"), /publish:dry-run.*npm publish --dry-run/i);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  it("accepts the npm-normalized package bin entrypoint", async () => {
    const { checkReleaseReadiness } = await import(releaseModuleUrl);
    const fixture = await createReleaseFixture({
      packageJson: createPackageJson({
        bin: {
          shipproof: "bin/shipproof.js"
        }
      })
    });

    try {
      const result = await checkReleaseReadiness({ root: fixture });

      assert.deepEqual(result.errors, []);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  it("detects stale pre-release readiness docs", async () => {
    const { checkReleaseReadiness } = await import(releaseModuleUrl);
    const fixture = await createReleaseFixture({
      releaseReadiness: [
        "# ShipProof Release Readiness - v0.3.0",
        "",
        "- Package version: `0.3.0`",
        "- Active docs reference: `kingkyylian/shipproof@v0.3.0`",
        "- Package is still private: `package.json#private` is `true`",
        "- Missing target tag: `v0.3.0`",
        "- Missing target GitHub release: `v0.3.0`",
        "- Run `npm run release:readiness` before approval.",
        "- Use `docs/release-notes/v0.3.0.md` as the release notes source.",
        "- Npm publishing remains disabled for this release candidate.",
        ""
      ].join("\n")
    });

    try {
      const result = await checkReleaseReadiness({ root: fixture });

      assert.match(result.errors.join("\n"), /Target tag.*v0\.3\.0/i);
      assert.match(result.errors.join("\n"), /GitHub PR proof.*release-candidate PR/i);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  it("detects GitHub Action run entrypoint drift", async () => {
    const { checkReleaseReadiness } = await import(releaseModuleUrl);
    const fixture = await createReleaseFixture({
      actionYaml: createActionYaml().replace('node "$GITHUB_ACTION_PATH/bin/shipproof.js" github', 'node "$GITHUB_ACTION_PATH/bin/shipproof.js" local')
    });

    try {
      const result = await checkReleaseReadiness({ root: fixture });

      assert.match(result.errors.join("\n"), /action\.yml.*bin\/shipproof\.js.*github/i);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });
});

async function createReleaseFixture(overrides = {}) {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "shipproof-release-readiness-"));
  const version = "0.3.0";
  const releaseNotesPath = path.join("docs", "release-notes", `v${version}.md`);
  const changelog = [
    "# Changelog",
    "",
    "## Unreleased",
    "",
    "No changes yet.",
    "",
    "## 0.3.0 - 2026-06-04",
    "",
    "### Added",
    "",
    "- A correct release note.",
    "",
    "## 0.2.0 - 2026-06-02",
    "",
    "### Added",
    "",
    "- A correct release note.",
    "",
    "## 0.1.0 - 2026-06-01",
    "",
    "### Added",
    "",
    "- Initial release.",
    ""
  ].join("\n");
  const releaseNotes = [
    "# ShipProof v0.3.0",
    "",
    "### Added",
    "",
    "- A correct release note.",
    ""
  ].join("\n");

  await mkdir(path.join(fixture, "bin"), { recursive: true });
  await mkdir(path.join(fixture, "src"), { recursive: true });
  await mkdir(path.join(fixture, "scripts"), { recursive: true });
  await mkdir(path.join(fixture, "docs", "release-notes"), { recursive: true });

  await writeFile(path.join(fixture, "bin", "shipproof.js"), "");
  await writeFile(path.join(fixture, "src", "core.js"), "");
  await writeFile(path.join(fixture, "scripts", "mock-github-smoke.mjs"), "");
  await writeFile(path.join(fixture, "scripts", "pack-smoke.mjs"), "");
  await writeFile(path.join(fixture, "scripts", "release-readiness.mjs"), "");
  await writeFile(path.join(fixture, "CHANGELOG.md"), overrides.changelog ?? changelog);
  await writeFile(path.join(fixture, releaseNotesPath), overrides.releaseNotes ?? releaseNotes);
  await writeFile(path.join(fixture, "action.yml"), overrides.actionYaml ?? createActionYaml());
  await writeFile(path.join(fixture, "package-lock.json"), overrides.packageLock ?? createPackageLock({ version }));
  await writeFile(path.join(fixture, "README.md"), createDocWithActionReference());
  await writeFile(path.join(fixture, "docs", "browser-smoke.md"), createDocWithActionReference());
  await writeFile(path.join(fixture, "docs", "configuration.md"), createDocWithActionReference());
  await writeFile(path.join(fixture, "docs", "security-lite.md"), createDocWithActionReference());
  await writeFile(path.join(fixture, "docs", "beta-test-matrix.md"), "Full matrix for v0.3.0.\n");
  await writeFile(path.join(fixture, "docs", "monorepo.md"), "Monorepo notes.\n");
  await writeFile(path.join(fixture, "docs", "report-schema.md"), "Report schema notes.\n");
  await writeFile(path.join(fixture, "docs", "live-github-verification.md"), "Live GitHub verification notes.\n");
  await writeFile(
    path.join(fixture, "docs", "release-readiness.md"),
    overrides.releaseReadiness ?? createReleaseReadinessDoc()
  );
  await writeFile(
    path.join(fixture, "package.json"),
    overrides.packageJson ?? createPackageJson({ releaseNotesPath })
  );

  return fixture;
}

function createReleaseReadinessDoc() {
  return [
    "# ShipProof Release Readiness - v0.3.0",
    "",
    "- Package version: `0.3.0`",
    "- Active docs reference: `kingkyylian/shipproof@v0.3.0`",
    "- Package is still private: `package.json#private` is `true`",
    "- Target tag: `v0.3.0`",
    "- Target GitHub release: `https://github.com/kingkyylian/shipproof/releases/tag/v0.3.0`",
    "- Release approval: required before tag or GitHub release.",
    "- GitHub PR proof: required on the release-candidate PR before merge.",
    "- Run `npm run release:readiness` before release approval.",
    "- Run `npm run publish:dry-run` before release approval.",
    "- Use `docs/release-notes/v0.3.0.md` as the release notes source.",
    "- Npm publishing remains disabled for this release candidate.",
    ""
  ].join("\n");
}

function createPackageJson(overrides = {}) {
  const releaseNotesPath = overrides.releaseNotesPath ?? path.join("docs", "release-notes", "v0.3.0.md");
  const { releaseNotesPath: _releaseNotesPath, ...packageOverrides } = overrides;
  const packageJson = {
    name: "shipproof",
    version: "0.3.0",
    private: true,
    type: "module",
    bin: {
      shipproof: "bin/shipproof.js"
    },
    files: [
      "action.yml",
      "CHANGELOG.md",
      "bin/",
      "src/",
      "scripts/mock-github-smoke.mjs",
      "scripts/pack-smoke.mjs",
      "scripts/release-readiness.mjs",
      "docs/browser-smoke.md",
      "docs/configuration.md",
      "docs/beta-test-matrix.md",
      "docs/monorepo.md",
      "docs/release-readiness.md",
      releaseNotesPath,
      "docs/security-lite.md",
      "docs/report-schema.md",
      "docs/live-github-verification.md"
    ],
    scripts: {
      test: "node --test",
      "smoke:github-mock": "node scripts/mock-github-smoke.mjs",
      "pack:smoke": "node scripts/pack-smoke.mjs",
      "publish:dry-run": "npm publish --dry-run",
      "release:readiness": "node scripts/release-readiness.mjs",
      shipproof: "node ./bin/shipproof.js"
    }
  };

  return JSON.stringify(
    {
      ...packageJson,
      ...packageOverrides,
      bin: overrides.bin ?? packageJson.bin,
      files: overrides.files ?? packageJson.files,
      scripts: overrides.scripts ?? packageJson.scripts
    },
    null,
    2
  );
}

function createPackageLock({ version }) {
  return JSON.stringify(
    {
      name: "shipproof",
      version,
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": {
          name: "shipproof",
          version,
          license: "MIT"
        }
      }
    },
    null,
    2
  );
}

function createDocWithActionReference() {
  return "- uses: kingkyylian/shipproof@v0.3.0\n";
}

function createActionYaml() {
  return [
    "inputs:",
    "  config-path:",
    "    required: false",
    "  json-report-path:",
    "    required: false",
    "  security-sarif-path:",
    "    required: false",
    "  browser-log-dir:",
    "    required: false",
    "  screenshot-dir:",
    "    required: false",
    "runs:",
    "  using: composite",
    "  steps:",
    "    - name: Run ShipProof",
    "      run: node \"$GITHUB_ACTION_PATH/bin/shipproof.js\" github",
    "      env:",
    "        INPUT_CONFIG_PATH: ${{ inputs.config-path }}",
    "        INPUT_JSON_REPORT_PATH: ${{ inputs.json-report-path }}",
    "        INPUT_SECURITY_SARIF_PATH: ${{ inputs.security-sarif-path }}",
    "        INPUT_BROWSER_LOG_DIR: ${{ inputs.browser-log-dir }}",
    "        INPUT_SCREENSHOT_DIR: ${{ inputs.screenshot-dir }}",
    ""
  ].join("\n");
}
