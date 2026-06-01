import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSecurityCheck,
  calculateShipScore,
  scanSecurityFindings
} from "../src/security.js";

describe("scanSecurityFindings", () => {
  it("flags committed env files, public secrets, unsafe CORS, and auth-sensitive edits", () => {
    const findings = scanSecurityFindings([
      { path: ".env", content: "STRIPE_SECRET_KEY=sk_live_1234567890\n" },
      { path: "src/app/api/route.ts", content: "return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })" },
      { path: "src/config.ts", content: "export const NEXT_PUBLIC_SECRET_TOKEN = 'abc123456789';" },
      { path: "middleware.ts", content: "export function middleware() {}" }
    ]);

    assert.deepEqual(findings.map((finding) => finding.id), [
      "committed-env-file",
      "possible-secret",
      "unsafe-cors",
      "public-secret",
      "auth-sensitive-change"
    ]);
    assert.deepEqual(findings.map((finding) => finding.severity), ["high", "high", "high", "high", "medium"]);
  });

  it("does not flag example placeholders as leaked secrets", () => {
    const findings = scanSecurityFindings([
      { path: ".env.example", content: "API_KEY=your_api_key_here\nSECRET=changeme\n" }
    ]);

    assert.deepEqual(findings, []);
  });
});

describe("buildSecurityCheck", () => {
  it("fails when high severity findings are present", () => {
    const check = buildSecurityCheck([
      { id: "unsafe-cors", severity: "high", file: "src/api/route.ts", message: "Wildcard CORS" }
    ]);

    assert.deepEqual(check, {
      name: "security-lite",
      command: "shipproof security-lite",
      status: "failed",
      summary: "1 high security finding",
      required: true
    });
  });

  it("passes with a clean summary when no findings are present", () => {
    assert.deepEqual(buildSecurityCheck([]), {
      name: "security-lite",
      command: "shipproof security-lite",
      status: "passed",
      summary: "No security-lite findings",
      required: true
    });
  });
});

describe("calculateShipScore", () => {
  it("returns no-ship for failed required checks and high security findings", () => {
    const score = calculateShipScore({
      status: "failed",
      checks: [{ name: "security-lite", status: "failed", required: true }],
      risks: [{ category: "auth", severity: "high", files: ["middleware.ts"] }],
      securityFindings: [{ id: "unsafe-cors", severity: "high", file: "src/api/route.ts" }]
    });

    assert.deepEqual(score, {
      score: 20,
      decision: "no-ship"
    });
  });

  it("returns ship for a clean passing proof", () => {
    const score = calculateShipScore({
      status: "passed",
      checks: [{ name: "test", status: "passed", required: true }],
      risks: [],
      securityFindings: []
    });

    assert.deepEqual(score, {
      score: 100,
      decision: "ship"
    });
  });
});
