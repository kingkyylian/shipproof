import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAgentFeedbackPrompt } from "../src/agent-feedback.js";

describe("createAgentFeedbackPrompt", () => {
  it("returns null for clean ship decisions", () => {
    const prompt = createAgentFeedbackPrompt({
      decision: "ship",
      status: "passed",
      score: 100,
      checks: [],
      risks: [],
      securityFindings: [],
      suggestedNextTests: [],
      changedFiles: []
    });

    assert.equal(prompt, null);
  });

  it("builds a focused prompt for failed proof reports", () => {
    const prompt = createAgentFeedbackPrompt({
      decision: "no-ship",
      status: "failed",
      score: 37,
      checks: [
        { name: "test", command: "npm test", status: "failed", summary: "auth flow failed" },
        { name: "build", command: "npm run build", status: "not_checked", summary: "Skipped after test failure" }
      ],
      risks: [{ category: "auth", severity: "high", files: ["middleware.ts"] }],
      securityFindings: [
        {
          id: "unsafe-cors",
          severity: "high",
          file: "src/api/route.ts",
          message: "Wildcard CORS allows any origin."
        }
      ],
      suggestedNextTests: ["Add authenticated and unauthenticated smoke coverage for changed auth paths."],
      changedFiles: ["middleware.ts", "src/api/route.ts"]
    });

    assert.match(prompt, /Fix the ShipProof failures before merge\./);
    assert.match(prompt, /Decision: no-ship \(score 37\/100, status failed\)/);
    assert.match(prompt, /test: failed - auth flow failed/);
    assert.match(prompt, /unsafe-cors \(high\) in src\/api\/route\.ts/);
    assert.match(prompt, /auth \(high\): middleware\.ts/);
    assert.match(prompt, /npm run shipproof -- --changed middleware\.ts,src\/api\/route\.ts/);
    assert.match(prompt, /Do not refactor unrelated files\./);
  });
});
