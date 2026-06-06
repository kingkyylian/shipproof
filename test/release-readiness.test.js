import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const releaseModuleUrl = pathToFileURL(path.join(repoRoot, "scripts", "release-readiness.mjs")).href;

describe("release readiness gate", () => {
  it("passes the current v0.4.0 release contract", async () => {
    const { checkReleaseReadiness } = await import(releaseModuleUrl);

    const result = await checkReleaseReadiness({ root: repoRoot });

    assert.deepEqual(result.errors, []);
    assert.equal(result.version, "0.4.0");
  });

  it("accepts version override fixtures for future release candidates", async () => {
    const { checkReleaseReadiness } = await import(releaseModuleUrl);
    const fixture = await createReleaseFixture({ version: "0.4.1" });

    try {
      const result = await checkReleaseReadiness({ root: fixture, version: "0.4.1" });

      assert.deepEqual(result.errors, []);
      assert.equal(result.version, "0.4.1");

      const packageJson = JSON.parse(await readFile(path.join(fixture, "package.json"), "utf8"));
      const packageLock = JSON.parse(await readFile(path.join(fixture, "package-lock.json"), "utf8"));
      const releaseNotes = await readFile(path.join(fixture, "docs", "release-notes", "v0.4.1.md"), "utf8");

      assert.equal(packageJson.version, "0.4.1");
      assert.equal(packageLock.version, "0.4.1");
      assert.equal(packageLock.packages[""].version, "0.4.1");
      assert.match(releaseNotes, /^# ShipProof v0\.4\.1\n/);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  it("detects release notes that drift from the changelog section", async () => {
    const { checkReleaseReadiness } = await import(releaseModuleUrl);
    const fixture = await createReleaseFixture({
      releaseNotes: [
        "# ShipProof v0.4.0",
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

      assert.match(result.errors.join("\n"), /package-lock\.json.*0\.4\.0/i);
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

  it("detects missing publishing support docs from package files", async () => {
    const { checkReleaseReadiness } = await import(releaseModuleUrl);
    const packageJson = JSON.parse(createPackageJson());
    packageJson.files = packageJson.files.filter((file) => {
      return file !== "docs/npm-publishing.md" && file !== "docs/post-release-observations.md";
    });
    const fixture = await createReleaseFixture({
      packageJson: JSON.stringify(packageJson, null, 2)
    });

    try {
      const result = await checkReleaseReadiness({ root: fixture });

      assert.match(result.errors.join("\n"), /package\.json#files must include docs\/npm-publishing\.md/i);
      assert.match(result.errors.join("\n"), /package\.json#files must include docs\/post-release-observations\.md/i);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  it("detects stale npm publishing docs", async () => {
    const { checkReleaseReadiness } = await import(releaseModuleUrl);
    const fixture = await createReleaseFixture({
      npmPublishing: createNpmPublishingDoc().replace(
        "kingkyylian/shipproof@v0.4.0",
        "kingkyylian/shipproof@v0.2.0"
      )
    });

    try {
      const result = await checkReleaseReadiness({ root: fixture });

      assert.match(result.errors.join("\n"), /docs\/npm-publishing\.md.*kingkyylian\/shipproof@v0\.4\.0/i);
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
        "# ShipProof Release Readiness - v0.4.0",
        "",
        "- Package version: `0.4.0`",
        "- Active docs reference: `kingkyylian/shipproof@v0.4.0`",
        "- Package is still private: `package.json#private` is `true`",
        "- Missing target tag: `v0.4.0`",
        "- Missing target GitHub release: `v0.4.0`",
        "- Run `npm run release:readiness` before approval.",
        "- Use `docs/release-notes/v0.4.0.md` as the release notes source.",
        "- Npm publishing remains disabled for this release candidate.",
        ""
      ].join("\n")
    });

    try {
      const result = await checkReleaseReadiness({ root: fixture });

      assert.match(result.errors.join("\n"), /Target tag.*v0\.4\.0/i);
      assert.match(result.errors.join("\n"), /GitHub PR proof.*release-candidate PR/i);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  it("accepts post-release readiness docs", async () => {
    const { checkReleaseReadiness } = await import(releaseModuleUrl);
    const fixture = await createReleaseFixture({
      releaseReadiness: [
        "# ShipProof Release Readiness - v0.4.0",
        "",
        "- Package version: `0.4.0`",
        "- Active docs reference: `kingkyylian/shipproof@v0.4.0`",
        "- Package is still private: `package.json#private` is `true`",
        "- Released tag: `v0.4.0`",
        "- GitHub release: `https://github.com/kingkyylian/shipproof/releases/tag/v0.4.0`",
        "- Release target commit: `31847cbbe1c8aba1f5e65d42ea983d90ce3c9403`",
        "- Post-release dogfood: PR #20, run `27021495375`.",
        "- Run `npm run release:readiness` before release approval.",
        "- Run `npm run publish:dry-run` before release approval.",
        "- Use `docs/release-notes/v0.4.0.md` as the release notes source.",
        "- Npm publishing remains disabled for this release candidate.",
        ""
      ].join("\n")
    });

    try {
      const result = await checkReleaseReadiness({ root: fixture });

      assert.deepEqual(result.errors, []);
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
  const version = overrides.version ?? "0.4.0";
  const releaseDate = overrides.releaseDate ?? "2026-06-06";
  const tag = `v${version}`;
  const releaseNotesPath = path.join("docs", "release-notes", `v${version}.md`);
  const changelog = [
    "# Changelog",
    "",
    "## Unreleased",
    "",
    "No changes yet.",
    "",
    `## ${version} - ${releaseDate}`,
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
    `# ShipProof ${tag}`,
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
  await writeFile(path.join(fixture, "README.md"), createDocWithActionReference({ version }));
  await writeFile(path.join(fixture, "docs", "browser-smoke.md"), createDocWithActionReference({ version }));
  await writeFile(path.join(fixture, "docs", "configuration.md"), createDocWithActionReference({ version }));
  await writeFile(path.join(fixture, "docs", "security-lite.md"), createDocWithActionReference({ version }));
  await writeFile(path.join(fixture, "docs", "beta-test-matrix.md"), `Full matrix for v${version}.\n`);
  await writeFile(path.join(fixture, "docs", "monorepo.md"), "Monorepo notes.\n");
  await writeFile(path.join(fixture, "docs", "npm-publishing.md"), overrides.npmPublishing ?? createNpmPublishingDoc({ version }));
  await writeFile(path.join(fixture, "docs", "post-release-observations.md"), "Post-release observation notes.\n");
  await writeFile(path.join(fixture, "docs", "report-schema.md"), "Report schema notes.\n");
  await writeFile(path.join(fixture, "docs", "live-github-verification.md"), "Live GitHub verification notes.\n");
  await writeFile(
    path.join(fixture, "docs", "release-readiness.md"),
    overrides.releaseReadiness ?? createReleaseReadinessDoc({ version })
  );
  await writeFile(
    path.join(fixture, "package.json"),
    overrides.packageJson ?? createPackageJson({ version, releaseNotesPath })
  );

  return fixture;
}

function createReleaseReadinessDoc({ version = "0.4.0" } = {}) {
  const tag = `v${version}`;

  return [
    `# ShipProof Release Readiness - ${tag}`,
    "",
    `- Package version: \`${version}\``,
    `- Active docs reference: \`kingkyylian/shipproof@${tag}\``,
    "- Package is still private: `package.json#private` is `true`",
    `- Target tag: \`${tag}\``,
    `- Target GitHub release: \`https://github.com/kingkyylian/shipproof/releases/tag/${tag}\``,
    "- Release approval: required before tag or GitHub release.",
    "- GitHub PR proof: required on the release-candidate PR before merge.",
    "- Run `npm run release:readiness` before release approval.",
    "- Run `npm run publish:dry-run` before release approval.",
    `- Use \`docs/release-notes/${tag}.md\` as the release notes source.`,
    "- Npm publishing remains disabled for this release candidate.",
    ""
  ].join("\n");
}

function createPackageJson(overrides = {}) {
  const version = overrides.version ?? "0.4.0";
  const releaseNotesPath = overrides.releaseNotesPath ?? path.join("docs", "release-notes", `v${version}.md`);
  const { releaseNotesPath: _releaseNotesPath, ...packageOverrides } = overrides;
  const packageJson = {
    name: "shipproof",
    version,
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
      "docs/npm-publishing.md",
      "docs/post-release-observations.md",
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

function createDocWithActionReference({ version = "0.4.0" } = {}) {
  return `- uses: kingkyylian/shipproof@v${version}\n`;
}

function createNpmPublishingDoc({ version = "0.4.0" } = {}) {
  return [
    "# ShipProof npm Publishing Plan",
    "",
    `- GitHub Action distribution is live at \`kingkyylian/shipproof@v${version}\`.`,
    "- `package.json#private` is `true`.",
    "- npm publishing remains out of scope until trusted publishing is prepared.",
    "- Require `npm publish --dry-run` before publish.",
    "",
    "## Rollback and Deprecation Plan",
    "",
    "- Publish a fixed patch instead of deleting history.",
    ""
  ].join("\n");
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
