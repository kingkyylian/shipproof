import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runGitHubProof } from "../src/action.js";

describe("runGitHubProof", () => {
  it("reads PR files, writes artifact markdown, appends step summary, and comments by default", async () => {
    const writes = [];
    const jsonWrites = [];
    const summaries = [];
    const requests = [];

    const result = await runGitHubProof({
      packageJson: { scripts: { test: "node --test" } },
      event: { pull_request: { number: 42, head: { sha: "abc123" } } },
      env: {
        GITHUB_REPOSITORY: "acme/demo",
        INPUT_REPORT_PATH: "artifacts/proof.md",
        INPUT_JSON_REPORT_PATH: "artifacts/proof.json"
      },
      executeCommand: async () => ({ exitCode: 0, durationMs: 25, stdout: "ok" }),
      request: async (path, options = {}) => {
        requests.push({ path, options });

        if (path.endsWith("/files?per_page=100&page=1")) {
          return [{ filename: "middleware.ts" }];
        }

        if (path.endsWith("/files?per_page=100&page=2")) {
          return [];
        }

        if (path.endsWith("/comments?per_page=100")) {
          return [];
        }

        return { id: 9 };
      },
      writeReport: async (file, markdown) => writes.push({ file, markdown }),
      writeJsonReport: async (file, payload) => jsonWrites.push({ file, payload }),
      appendSummary: async (markdown) => summaries.push(markdown)
    });

    assert.equal(result.reportPath, "artifacts/proof.md");
    assert.equal(result.jsonReportPath, "artifacts/proof.json");
    assert.equal(result.commentAction, "created");
    assert.deepEqual(result.changedFiles, ["middleware.ts"]);
    assert.equal(writes.length, 1);
    assert.match(writes[0].markdown, /# ShipProof Report/);
    assert.deepEqual(jsonWrites, [
      {
        file: "artifacts/proof.json",
        payload: result.report
      }
    ]);
    assert.equal(jsonWrites[0].payload.schemaVersion, "1.0");
    assert.deepEqual(summaries, [writes[0].markdown]);
    assert.equal(requests.at(-1).path, "/repos/acme/demo/issues/42/comments");
  });

  it("skips commenting when INPUT_COMMENT is false", async () => {
    const requests = [];

    const result = await runGitHubProof({
      packageJson: { scripts: { test: "node --test" } },
      event: { pull_request: { number: 42 } },
      env: {
        GITHUB_REPOSITORY: "acme/demo",
        INPUT_COMMENT: "false"
      },
      executeCommand: async () => ({ exitCode: 0, durationMs: 25 }),
      request: async (path) => {
        requests.push(path);

        if (path.endsWith("/files?per_page=100&page=1")) {
          return [];
        }

        return [];
      },
      writeReport: async () => {},
      appendSummary: async () => {}
    });

    assert.equal(result.commentAction, "skipped");
    assert.deepEqual(requests, ["/repos/acme/demo/pulls/42/files?per_page=100&page=1"]);
  });

  it("keeps artifacts and summary when comment permissions are unavailable", async () => {
    const writes = [];
    const summaries = [];

    const result = await runGitHubProof({
      packageJson: { scripts: { test: "node --test" } },
      event: { pull_request: { number: 42 } },
      env: {
        GITHUB_REPOSITORY: "acme/demo",
        INPUT_REPORT_PATH: "artifacts/proof.md"
      },
      changedFiles: ["src/app/page.tsx"],
      executeCommand: async () => ({ exitCode: 0, durationMs: 25 }),
      request: async (path) => {
        if (path.endsWith("/comments?per_page=100")) {
          const error = new Error("GitHub API 403 for comments: Resource not accessible by integration");
          error.status = 403;
          throw error;
        }

        return [];
      },
      writeReport: async (file, markdown) => writes.push({ file, markdown }),
      writeJsonReport: async () => {},
      appendSummary: async (markdown) => summaries.push(markdown)
    });

    assert.equal(result.commentAction, "skipped-permission");
    assert.equal(writes.length, 1);
    assert.equal(summaries.length, 1);
    assert.match(writes[0].markdown, /# ShipProof Report/);
  });

  it("uses an explicit changed file list instead of reading PR files", async () => {
    const requests = [];

    const result = await runGitHubProof({
      packageJson: { scripts: { test: "node --test" } },
      event: { pull_request: { number: 42 } },
      env: {
        GITHUB_REPOSITORY: "acme/demo",
        INPUT_COMMENT: "false"
      },
      changedFiles: ["src/app/page.tsx"],
      executeCommand: async () => ({ exitCode: 0, durationMs: 25 }),
      request: async (path) => {
        requests.push(path);
        return [];
      },
      writeReport: async () => {},
      appendSummary: async () => {}
    });

    assert.deepEqual(result.changedFiles, ["src/app/page.tsx"]);
    assert.deepEqual(requests, []);
  });

  it("adds browser smoke proof when a supported frontend route changes", async () => {
    const browserPlans = [];

    const result = await runGitHubProof({
      packageJson: {
        scripts: { test: "node --test", dev: "next dev" },
        dependencies: { next: "15.0.0" }
      },
      event: { pull_request: { number: 42 } },
      env: {
        GITHUB_REPOSITORY: "acme/demo",
        INPUT_COMMENT: "false",
        INPUT_BROWSER_BASE_URL: "http://127.0.0.1:3000",
        INPUT_SCREENSHOT_DIR: "artifacts/screens"
      },
      changedFiles: ["src/app/login/page.tsx"],
      executeCommand: async () => ({ exitCode: 0, durationMs: 25 }),
      request: async () => [],
      browserSmoke: async ({ plan }) => {
        browserPlans.push(plan);
        return {
          name: "browser-smoke",
          command: "playwright smoke (next)",
          status: "passed",
          durationMs: 50,
          summary: "1 routes passed; screenshots: artifacts/screens",
          required: true
        };
      },
      writeReport: async () => {},
      appendSummary: async () => {}
    });

    assert.deepEqual(browserPlans, [
      {
        framework: "next",
        devCommand: null,
        baseUrl: "http://127.0.0.1:3000",
        routes: ["/login"],
        screenshotDir: "artifacts/screens"
      }
    ]);
    assert.deepEqual(result.report.checks.map((check) => check.name), ["test", "security-lite", "browser-smoke"]);
    assert.equal(result.report.status, "passed");
  });
});
