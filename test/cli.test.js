import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("shipproof CLI", () => {
  it("honors local browser artifact path flags when config defaults are loaded", async () => {
    const fixture = await mkdtemp(path.join(os.tmpdir(), "shipproof-cli-"));

    try {
      await mkdir(path.join(fixture, "src"), { recursive: true });
      await writeFile(
        path.join(fixture, "package.json"),
        JSON.stringify({
          type: "module",
          scripts: {
            dev: "vite"
          },
          devDependencies: {
            vite: "8.0.0"
          }
        })
      );
      await writeFile(path.join(fixture, "src", "App.tsx"), "export function App() { return null; }\n");
      await writeFile(
        path.join(fixture, "shipproof.config.json"),
        JSON.stringify({
          browser: {
            required: false
          }
        })
      );

      const reportPath = path.join(fixture, "report.json");
      const sarifPath = path.join(fixture, "security.sarif");
      const screenshotDir = path.join(fixture, "custom-screens");
      const logDir = path.join(fixture, "custom-browser-logs");
      const result = await runCli([
        "--changed",
        "src/App.tsx",
        "--config",
        "shipproof.config.json",
        "--browser-base-url",
        "http://127.0.0.1:9",
        "--screenshot-dir",
        screenshotDir,
        "--browser-log-dir",
        logDir,
        "--json-report-path",
        reportPath,
        "--security-sarif-path",
        sarifPath
      ], fixture);

      assert.equal(result.code, 0, result.stderr);

      const report = JSON.parse(await readFile(reportPath, "utf8"));

      assert.equal(report.artifacts.screenshots, screenshotDir);
      assert.equal(report.artifacts.browserLogs, logDir);
      assert.deepEqual(report.checks.map((check) => `${check.name}:${check.status}`), [
        "security-lite:passed",
        "browser-smoke:not_checked"
      ]);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });
});

function runCli(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn("node", [path.join(repoRoot, "bin", "shipproof.js"), ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}
