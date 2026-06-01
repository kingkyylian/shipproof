import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createProofReport,
  classifyChangedFiles,
  discoverProjectCommands,
  renderProofReport,
  runProof
} from "../src/core.js";

describe("discoverProjectCommands", () => {
  it("maps common package scripts to proof checks in execution order", () => {
    const packageJson = {
      scripts: {
        dev: "vite --host 0.0.0.0",
        lint: "eslint .",
        test: "node --test",
        build: "vite build",
        format: "prettier --check ."
      }
    };

    assert.deepEqual(discoverProjectCommands(packageJson), [
      { name: "lint", command: "npm run lint", required: false },
      { name: "test", command: "npm test", required: true },
      { name: "build", command: "npm run build", required: true }
    ]);
  });

  it("returns an empty list when no proof-relevant scripts exist", () => {
    assert.deepEqual(discoverProjectCommands({ scripts: { dev: "next dev" } }), []);
  });
});

describe("classifyChangedFiles", () => {
  it("classifies auth, database, backend, frontend, config, payment, and dependency risks", () => {
    const risks = classifyChangedFiles([
      "src/app/login/page.tsx",
      "src/api/users/route.ts",
      "supabase/migrations/001_init.sql",
      "src/payments/stripe-webhook.ts",
      "middleware.ts",
      ".env.example",
      "package-lock.json"
    ]);

    assert.deepEqual(risks, [
      { category: "auth", severity: "high", files: ["src/app/login/page.tsx", "middleware.ts"] },
      { category: "database", severity: "high", files: ["supabase/migrations/001_init.sql"] },
      { category: "payment", severity: "high", files: ["src/payments/stripe-webhook.ts"] },
      { category: "backend", severity: "medium", files: ["src/api/users/route.ts"] },
      { category: "config", severity: "medium", files: [".env.example"] },
      { category: "dependency", severity: "medium", files: ["package-lock.json"] },
      { category: "frontend", severity: "low", files: ["src/app/login/page.tsx"] }
    ]);
  });
});

describe("renderProofReport", () => {
  it("renders a merge-facing markdown report with status, checks, risks, and next tests", () => {
    const markdown = renderProofReport({
      status: "failed",
      generatedAt: "2026-06-01T14:31:00.000Z",
      checks: [
        { name: "lint", command: "npm run lint", status: "passed", durationMs: 1200 },
        { name: "test", command: "npm test", status: "failed", durationMs: 900, summary: "1 failing test" },
        { name: "build", command: "npm run build", status: "not_checked", summary: "Skipped after test failure" }
      ],
      risks: [
        { category: "auth", severity: "high", files: ["middleware.ts"] },
        { category: "frontend", severity: "low", files: ["src/app/page.tsx"] }
      ],
      suggestedNextTests: [
        "Add an authenticated and unauthenticated smoke test for middleware.ts.",
        "Open the changed UI route in a browser and capture console errors."
      ]
    });

    assert.equal(
      markdown,
      [
        "# ShipProof Report",
        "",
        "**Status:** failed",
        "**Generated:** 2026-06-01T14:31:00.000Z",
        "",
        "## Checks",
        "",
        "| Check | Command | Status | Duration | Summary |",
        "| --- | --- | --- | --- | --- |",
        "| lint | `npm run lint` | passed | 1.2s |  |",
        "| test | `npm test` | failed | 0.9s | 1 failing test |",
        "| build | `npm run build` | not checked | n/a | Skipped after test failure |",
        "",
        "## Risky Changes",
        "",
        "| Risk | Severity | Files |",
        "| --- | --- | --- |",
        "| auth | high | `middleware.ts` |",
        "| frontend | low | `src/app/page.tsx` |",
        "",
        "## Suggested Next Tests",
        "",
        "- Add an authenticated and unauthenticated smoke test for middleware.ts.",
        "- Open the changed UI route in a browser and capture console errors.",
        ""
      ].join("\n")
    );
  });

  it("renders decision, score, and security findings when present", () => {
    const markdown = renderProofReport({
      status: "failed",
      generatedAt: "2026-06-01T17:00:00.000Z",
      decision: "no-ship",
      score: 20,
      checks: [
        { name: "security-lite", command: "shipproof security-lite", status: "failed", summary: "1 high security finding" }
      ],
      risks: [],
      securityFindings: [
        {
          id: "unsafe-cors",
          severity: "high",
          file: "src/api/route.ts",
          message: "Wildcard CORS allows any origin."
        }
      ],
      suggestedNextTests: []
    });

    assert.match(markdown, /\*\*Decision:\*\* no-ship/);
    assert.match(markdown, /\*\*Score:\*\* 20\/100/);
    assert.match(markdown, /## Security Findings/);
    assert.match(markdown, /Wildcard CORS allows any origin/);
  });
});

describe("createProofReport", () => {
  it("derives failed status and targeted next tests from required command failures and risky files", () => {
    const report = createProofReport({
      packageJson: {
        scripts: {
          lint: "eslint .",
          test: "node --test",
          build: "vite build"
        }
      },
      changedFiles: ["middleware.ts", "src/api/users/route.ts", "src/app/page.tsx"],
      checkResults: [
        { name: "lint", command: "npm run lint", status: "passed", durationMs: 100 },
        { name: "test", command: "npm test", status: "failed", durationMs: 220, summary: "auth test failed" },
        { name: "build", command: "npm run build", status: "not_checked", summary: "Skipped after test failure" }
      ],
      generatedAt: "2026-06-01T15:00:00.000Z"
    });

    assert.equal(report.status, "failed");
    assert.deepEqual(report.risks.map((risk) => risk.category), ["auth", "backend", "frontend"]);
    assert.deepEqual(report.suggestedNextTests, [
      "Add authenticated and unauthenticated smoke coverage for changed auth paths.",
      "Exercise changed API routes with success, unauthorized, and invalid-input requests.",
      "Open changed UI routes in a browser and capture console or network errors."
    ]);
    assert.match(report.markdown, /\*\*Status:\*\* failed/);
  });

  it("returns passed status when all required checks pass", () => {
    const report = createProofReport({
      packageJson: {
        scripts: {
          lint: "eslint .",
          test: "node --test"
        }
      },
      changedFiles: ["src/lib/math.js"],
      checkResults: [
        { name: "lint", command: "npm run lint", status: "failed", durationMs: 100, summary: "style issue" },
        { name: "test", command: "npm test", status: "passed", durationMs: 220 }
      ],
      generatedAt: "2026-06-01T15:00:00.000Z"
    });

    assert.equal(report.status, "passed");
  });

  it("does not pass when a required check was not executed", () => {
    const report = createProofReport({
      packageJson: {
        scripts: {
          test: "node --test",
          build: "vite build"
        }
      },
      changedFiles: [],
      checkResults: [
        { name: "test", command: "npm test", status: "passed", durationMs: 100 },
        { name: "build", command: "npm run build", status: "not_checked", summary: "Missing build runner" }
      ],
      generatedAt: "2026-06-01T15:10:00.000Z"
    });

    assert.equal(report.status, "not_checked");
  });

  it("honors required check metadata provided directly on a check result", () => {
    const report = createProofReport({
      packageJson: {
        scripts: {
          test: "node --test"
        }
      },
      changedFiles: [],
      checkResults: [
        { name: "test", command: "npm test", status: "passed", durationMs: 100 },
        {
          name: "browser-smoke",
          command: "playwright smoke",
          status: "failed",
          durationMs: 20,
          summary: "console error",
          required: true
        }
      ],
      generatedAt: "2026-06-01T15:20:00.000Z"
    });

    assert.equal(report.status, "failed");
  });

  it("includes security findings in the report score and decision", () => {
    const report = createProofReport({
      packageJson: {
        scripts: {
          test: "node --test"
        }
      },
      changedFiles: ["src/api/route.ts"],
      checkResults: [
        { name: "test", command: "npm test", status: "passed", durationMs: 100 },
        {
          name: "security-lite",
          command: "shipproof security-lite",
          status: "failed",
          summary: "1 high security finding",
          required: true
        }
      ],
      securityFindings: [
        { id: "unsafe-cors", severity: "high", file: "src/api/route.ts", message: "Wildcard CORS allows any origin." }
      ],
      generatedAt: "2026-06-01T17:10:00.000Z"
    });

    assert.equal(report.status, "failed");
    assert.equal(report.decision, "no-ship");
    assert.equal(report.score, 29);
    assert.match(report.markdown, /## Security Findings/);
    assert.match(report.markdown, /## Agent Feedback Prompt/);
    assert.match(report.agentFeedbackPrompt, /Fix the ShipProof failures before merge/);
  });

  it("includes a schema version and applies configured score thresholds", () => {
    const report = createProofReport({
      packageJson: {
        scripts: {
          test: "node --test"
        }
      },
      changedFiles: ["middleware.ts"],
      checkResults: [{ name: "test", command: "npm test", status: "passed", durationMs: 100 }],
      config: {
        score: {
          ship: 90,
          review: 60
        }
      },
      generatedAt: "2026-06-01T17:30:00.000Z"
    });

    assert.equal(report.schemaVersion, "1.0");
    assert.equal(report.score, 85);
    assert.equal(report.decision, "review");
  });
});

describe("runProof", () => {
  it("executes discovered checks in order and skips remaining checks after a required failure", async () => {
    const executed = [];
    const report = await runProof({
      packageJson: {
        scripts: {
          lint: "eslint .",
          test: "node --test",
          build: "vite build"
        }
      },
      changedFiles: ["src/app/login/page.tsx"],
      generatedAt: "2026-06-01T15:30:00.000Z",
      executeCommand: async (command) => {
        executed.push(command);

        if (command === "npm test") {
          return { exitCode: 1, durationMs: 90, stderr: "login flow failed\nstack omitted" };
        }

        return { exitCode: 0, durationMs: 50, stdout: "ok" };
      }
    });

    assert.deepEqual(executed, ["npm run lint", "npm test"]);
    assert.deepEqual(report.checks, [
      { name: "lint", command: "npm run lint", status: "passed", durationMs: 50, summary: "ok" },
      { name: "test", command: "npm test", status: "failed", durationMs: 90, summary: "login flow failed" },
      { name: "build", command: "npm run build", status: "not_checked", summary: "Skipped after test failure" }
    ]);
    assert.equal(report.status, "failed");
  });

  it("includes a required browser smoke check in the overall proof status", async () => {
    const report = await runProof({
      packageJson: {
        scripts: {
          test: "node --test"
        }
      },
      changedFiles: ["src/app/page.tsx"],
      generatedAt: "2026-06-01T16:00:00.000Z",
      executeCommand: async () => ({ exitCode: 0, durationMs: 50, stdout: "ok" }),
      browserSmoke: async () => ({
        name: "browser-smoke",
        command: "playwright smoke",
        status: "failed",
        durationMs: 75,
        summary: "console error: Hydration failed",
        required: true
      })
    });

    assert.equal(report.status, "failed");
    assert.deepEqual(report.checks.map((check) => check.name), ["test", "browser-smoke"]);
    assert.match(report.markdown, /browser-smoke/);
  });

  it("runs security scan before browser smoke and skips browser after high security failure", async () => {
    let browserRan = false;
    const report = await runProof({
      packageJson: {
        scripts: {
          test: "node --test"
        }
      },
      changedFiles: ["src/api/route.ts"],
      generatedAt: "2026-06-01T17:20:00.000Z",
      executeCommand: async () => ({ exitCode: 0, durationMs: 50, stdout: "ok" }),
      securityScan: async () => [
        { id: "unsafe-cors", severity: "high", file: "src/api/route.ts", message: "Wildcard CORS allows any origin." }
      ],
      browserSmoke: async () => {
        browserRan = true;
      }
    });

    assert.equal(browserRan, false);
    assert.deepEqual(report.checks.map((check) => check.name), ["test", "security-lite"]);
    assert.equal(report.status, "failed");
  });

  it("skips security-lite when config disables security checks", async () => {
    let securityRan = false;
    const report = await runProof({
      packageJson: {
        scripts: {
          test: "node --test"
        }
      },
      changedFiles: ["src/api/route.ts"],
      generatedAt: "2026-06-01T17:40:00.000Z",
      config: {
        security: {
          enabled: false
        }
      },
      executeCommand: async () => ({ exitCode: 0, durationMs: 50, stdout: "ok" }),
      securityScan: async () => {
        securityRan = true;
        return [];
      }
    });

    assert.equal(securityRan, false);
    assert.deepEqual(report.checks.map((check) => check.name), ["test"]);
    assert.equal(report.status, "passed");
  });
});
