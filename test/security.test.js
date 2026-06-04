import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSecurityCheck,
  calculateShipScore,
  createSecuritySarif,
  scanSecurityFindings
} from "../src/security.js";

describe("scanSecurityFindings", () => {
  it("flags committed env files, public secrets, unsafe CORS, and auth-sensitive edits", () => {
    const publicSecretName = "NEXT_PUBLIC_" + "SECRET_TOKEN";
    const findings = scanSecurityFindings([
      { path: ".env", content: "STRIPE_SECRET_KEY=sk_live_1234567890\n" },
      { path: "src/app/api/route.ts", content: `return new Response('ok', { headers: { '${corsHeader()}': '*' } })` },
      { path: "src/config.ts", content: `export const ${publicSecretName} = 'abc123456789';` },
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

  it("includes line, column, redacted snippet, and suppression guidance", () => {
    const secretValue = "sk_live_" + "hidden_value";
    const findings = scanSecurityFindings([
      {
        path: "src/secrets.ts",
        content: [
          "export const region = 'eu';",
          `STRIPE_SECRET_KEY=${secretValue}`,
          ""
        ].join("\n")
      }
    ]);

    assert.deepEqual(findings, [
      {
        id: "possible-secret",
        severity: "high",
        file: "src/secrets.ts",
        line: 2,
        column: 1,
        snippet: "STRIPE_SECRET_KEY=[redacted]",
        message: "STRIPE_SECRET_KEY looks like a committed secret.",
        allowlistHint: "Add security.allow with id, file, line, reason, and expiresAt if this is intentional."
      }
    ]);
    assert.equal(JSON.stringify(findings).includes(secretValue), false);
  });

  it("suppresses non-expired allowlist entries and ignores expired ones", () => {
    const files = [
      {
        path: "src/api/route.ts",
        content: `return new Response('ok', { headers: { '${corsHeader()}': '*' } });`
      }
    ];

    assert.deepEqual(
      scanSecurityFindings(files, {
        now: new Date("2026-06-02T12:00:00.000Z"),
        allow: [
          {
            id: "unsafe-cors",
            file: "src/api/route.ts",
            line: 1,
            reason: "Intentional public demo endpoint.",
            expiresAt: "2026-07-01"
          }
        ]
      }),
      []
    );

    assert.deepEqual(
      scanSecurityFindings(files, {
        now: new Date("2026-06-02T12:00:00.000Z"),
        allow: [
          {
            id: "unsafe-cors",
            file: "src/api/route.ts",
            line: 1,
            reason: "Old waiver.",
            expiresAt: "2026-05-01"
          }
        ]
      }).map((finding) => finding.id),
      ["unsafe-cors"]
    );
  });

  it("requires allowlist entries to include both id and file", () => {
    const files = [
      {
        path: "src/api/route.ts",
        content: `return new Response('ok', { headers: { '${corsHeader()}': '*' } });`
      }
    ];

    assert.deepEqual(
      scanSecurityFindings(files, {
        now: new Date("2026-06-02T12:00:00.000Z"),
        allow: [
          {
            file: "src/api/route.ts",
            reason: "Too broad without finding id.",
            expiresAt: "2026-07-01"
          },
          {
            id: "unsafe-cors",
            reason: "Too broad without file.",
            expiresAt: "2026-07-01"
          }
        ]
      }).map((finding) => finding.id),
      ["unsafe-cors"]
    );
  });

  it("marks matching baseline findings without blocking the proof", () => {
    const files = [
      {
        path: "src/api/legacy/route.ts",
        content: `return new Response('ok', { headers: { '${corsHeader()}': '*' } });`
      }
    ];
    const findings = scanSecurityFindings(files, {
      now: new Date("2026-06-02T12:00:00.000Z"),
      baseline: [
        {
          id: "unsafe-cors",
          file: "src/api/legacy/route.ts",
          line: 1,
          reason: "Legacy endpoint is tracked until the auth rewrite lands.",
          expiresAt: "2026-07-01"
        }
      ]
    });

    assert.deepEqual(findings, [
      {
        id: "unsafe-cors",
        severity: "high",
        file: "src/api/legacy/route.ts",
        line: 1,
        column: 41,
        snippet: `return new Response('ok', { headers: { '${corsHeader()}': '*' } });`,
        message: "Wildcard CORS allows any origin.",
        allowlistHint: "Add security.allow with id, file, line, reason, and expiresAt if this is intentional.",
        status: "baseline",
        baselineReason: "Legacy endpoint is tracked until the auth rewrite lands.",
        baselineExpiresAt: "2026-07-01"
      }
    ]);
    assert.deepEqual(buildSecurityCheck(findings), {
      name: "security-lite",
      command: "shipproof security-lite",
      status: "passed",
      summary: "No active security-lite findings; 1 baseline finding",
      required: true
    });
    assert.deepEqual(
      calculateShipScore({
        status: "passed",
        checks: [{ name: "security-lite", status: "passed", required: true }],
        risks: [],
        securityFindings: findings
      }),
      {
        score: 100,
        decision: "ship"
      }
    );
  });

  it("treats expired baseline entries as active findings", () => {
    const findings = scanSecurityFindings(
      [
        {
          path: "src/api/legacy/route.ts",
          content: `return new Response('ok', { headers: { '${corsHeader()}': '*' } });`
        }
      ],
      {
        now: new Date("2026-06-02T12:00:00.000Z"),
        baseline: [
          {
            id: "unsafe-cors",
            file: "src/api/legacy/route.ts",
            line: 1,
            reason: "Expired baseline.",
            expiresAt: "2026-05-01"
          }
        ]
      }
    );

    assert.equal(findings[0].status, undefined);
    assert.deepEqual(buildSecurityCheck(findings), {
      name: "security-lite",
      command: "shipproof security-lite",
      status: "failed",
      summary: "1 high security finding",
      required: true
    });
  });

  it("flags Supabase public storage, disabled RLS, and broad anon writes", () => {
    const findings = scanSecurityFindings([
      {
        path: "supabase/migrations/20260604_storage_rls.sql",
        content: [
          "insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);",
          "alter table public.profiles disable row level security;",
          "create policy anon_insert on public.profiles for insert to anon with check (true);",
          ""
        ].join("\n")
      }
    ]);

    assert.deepEqual(findings.map((finding) => finding.id), [
      "public-storage-policy",
      "rls-disabled",
      "broad-anon-write"
    ]);
    assert.deepEqual(findings.map((finding) => finding.severity), ["high", "high", "high"]);
    assert.deepEqual(findings.map((finding) => finding.line), [1, 2, 3]);
  });

  it("applies configured severity overrides by finding id", () => {
    const findings = scanSecurityFindings(
      [
        {
          path: "src/api/route.ts",
          content: `return new Response('ok', { headers: { '${corsHeader()}': '*' } });`
        },
        {
          path: "supabase/migrations/20260604_storage.sql",
          content: "insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);"
        }
      ],
      {
        severity: {
          "unsafe-cors": "medium",
          "public-storage-policy": "low"
        }
      }
    );

    assert.deepEqual(
      findings.map((finding) => [finding.id, finding.severity]),
      [
        ["unsafe-cors", "medium"],
        ["public-storage-policy", "low"]
      ]
    );
    assert.deepEqual(buildSecurityCheck(findings), {
      name: "security-lite",
      command: "shipproof security-lite",
      status: "passed",
      summary: "1 medium security finding",
      required: true
    });
  });

  it("does not flag Supabase SQL examples in non-SQL files", () => {
    const findings = scanSecurityFindings([
      {
        path: "test/security.test.js",
        content: [
          "\"insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);\",",
          "\"alter table public.profiles disable row level security;\",",
          "\"create policy anon_insert on public.profiles for insert to anon with check (true);\",",
          ""
        ].join("\n")
      }
    ]);

    assert.deepEqual(findings, []);
  });
});

function corsHeader() {
  return "Access-Control-Allow-" + "Origin";
}

describe("createSecuritySarif", () => {
  it("renders active findings as SARIF results with source locations", () => {
    const sarif = createSecuritySarif([
      {
        id: "unsafe-cors",
        severity: "high",
        file: "src/api/route.ts",
        line: 4,
        column: 17,
        message: "Wildcard CORS allows any origin."
      }
    ]);

    assert.equal(sarif.version, "2.1.0");
    assert.equal(sarif.runs[0].tool.driver.name, "ShipProof security-lite");
    assert.deepEqual(sarif.runs[0].tool.driver.rules[0], {
      id: "unsafe-cors",
      name: "unsafe-cors",
      shortDescription: { text: "Wildcard CORS allows any origin." },
      defaultConfiguration: { level: "error" }
    });
    assert.deepEqual(sarif.runs[0].results[0], {
      ruleId: "unsafe-cors",
      level: "error",
      message: { text: "Wildcard CORS allows any origin." },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: "src/api/route.ts" },
            region: {
              startLine: 4,
              startColumn: 17
            }
          }
        }
      ]
    });
  });

  it("omits baseline findings from SARIF results", () => {
    const sarif = createSecuritySarif([
      {
        id: "unsafe-cors",
        severity: "high",
        status: "baseline",
        file: "src/api/legacy/route.ts",
        line: 1,
        column: 41,
        message: "Wildcard CORS allows any origin."
      }
    ]);

    assert.deepEqual(sarif.runs[0].tool.driver.rules, []);
    assert.deepEqual(sarif.runs[0].results, []);
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
