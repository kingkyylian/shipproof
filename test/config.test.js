import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadShipProofConfig, resolveShipProofConfig } from "../src/config.js";

describe("resolveShipProofConfig", () => {
  it("returns production defaults when no config is provided", () => {
    assert.deepEqual(resolveShipProofConfig(), {
      checks: {
        lint: "optional",
        typecheck: "optional",
        test: "required",
        build: "required"
      },
      browser: {
        enabled: true,
        required: true,
        baseUrl: null,
        routes: [],
        screenshotDir: "shipproof-screenshots",
        logDir: "shipproof-browser-logs",
        readyUrl: null,
        timeoutMs: 30000,
        waitUntil: "networkidle"
      },
      security: {
        enabled: true,
        allow: []
      },
      score: {
        ship: 80,
        review: 60
      },
      reports: {
        markdown: "shipproof-report.md",
        json: "shipproof-report.json",
        sarif: "shipproof-security.sarif"
      }
    });
  });

  it("deep-merges user config over defaults without dropping nested defaults", () => {
    assert.deepEqual(
      resolveShipProofConfig({
        browser: {
          required: false,
          routes: ["/login"]
        },
        score: {
          ship: 90
        }
      }),
      {
        checks: {
          lint: "optional",
          typecheck: "optional",
          test: "required",
          build: "required"
        },
        browser: {
          enabled: true,
          required: false,
          baseUrl: null,
          routes: ["/login"],
          screenshotDir: "shipproof-screenshots",
          logDir: "shipproof-browser-logs",
          readyUrl: null,
          timeoutMs: 30000,
          waitUntil: "networkidle"
        },
        security: {
          enabled: true,
          allow: []
        },
        score: {
          ship: 90,
          review: 60
        },
        reports: {
          markdown: "shipproof-report.md",
          json: "shipproof-report.json",
          sarif: "shipproof-security.sarif"
        }
      }
    );
  });
});

describe("loadShipProofConfig", () => {
  it("reads JSON config from an explicit path", async () => {
    const config = await loadShipProofConfig({
      filePath: "shipproof.config.json",
      readFile: async (file) => {
        assert.equal(file, "shipproof.config.json");
        return JSON.stringify({
          security: { enabled: false },
          reports: { json: "artifacts/proof.json", sarif: "artifacts/security.sarif" }
        });
      }
    });

    assert.equal(config.security.enabled, false);
    assert.equal(config.reports.json, "artifacts/proof.json");
    assert.equal(config.reports.sarif, "artifacts/security.sarif");
    assert.equal(config.browser.enabled, true);
  });
});
