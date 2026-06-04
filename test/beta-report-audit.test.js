import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";

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
