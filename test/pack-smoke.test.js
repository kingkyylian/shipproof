import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { describe, it } from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const packSmokeModuleUrl = pathToFileURL(path.join(repoRoot, "scripts", "pack-smoke.mjs")).href;

describe("pack smoke", () => {
  it("runs the packed CLI against a fixture project", async () => {
    const { runPackSmoke } = await import(packSmokeModuleUrl);

    const result = await runPackSmoke({ root: repoRoot, keepTemp: false });

    assert.equal(result.packageName, "shipproof");
    assert.equal(result.packageVersion, "0.3.0");
    assert.equal(result.report.status, "passed");
    assert.equal(result.report.decision, "ship");
    assert.equal(result.report.score, 100);
    assert.equal(result.report.schemaVersion, "1.0");
    assert.equal(result.sarif.version, "2.1.0");
    assert.equal(result.sarif.runs[0].results.length, 0);
  });
});
