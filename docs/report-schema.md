# ShipProof Report Schema

Current schema version: `1.0`

ShipProof writes these report artifacts:

- `shipproof-report.md`: human-readable PR comment and step summary.
- `shipproof-report.json`: machine-readable payload for automation.
- `shipproof-security.sarif`: SARIF `2.1.0` security-lite results in GitHub mode.

## Top-Level Shape

```json
{
  "schemaVersion": "1.0",
  "status": "passed",
  "decision": "ship",
  "score": 100,
  "generatedAt": "2026-06-01T16:49:35.606Z",
  "checks": [],
  "risks": [],
  "securityFindings": [],
  "suggestedNextTests": [],
  "agentFeedbackPrompt": null,
  "markdown": "# ShipProof Report\n..."
}
```

## Status

- `passed`: all required checks passed.
- `failed`: at least one required check failed.
- `not_checked`: at least one required check was skipped or no checks ran.

## Decision

- `ship`: clean enough to merge under current policy.
- `review`: no hard failure, but risk or score requires human review.
- `no-ship`: do not merge until failures or high-severity issues are fixed.

## Checks

Each check has:

```json
{
  "name": "test",
  "command": "npm test",
  "status": "passed",
  "durationMs": 250,
  "summary": "ok",
  "required": true
}
```

`required` may be omitted for checks whose requirement level comes from project defaults or config.

## Risks

Each risk has:

```json
{
  "category": "auth",
  "severity": "high",
  "files": ["middleware.ts"]
}
```

## Security Findings

Each finding has:

```json
{
  "id": "unsafe-cors",
  "severity": "high",
  "file": "src/api/route.ts",
  "line": 4,
  "column": 17,
  "snippet": "Wildcard CORS header allows any origin.",
  "allowlistHint": "Add security.allow with id, file, line, reason, and expiresAt if this is intentional.",
  "message": "Wildcard CORS allows any origin."
}
```

`line`, `column`, and `snippet` are included when source context is available. Secret snippets are redacted.

## SARIF

SARIF output is written separately from the JSON report. Each active security finding becomes one SARIF result with:

- `ruleId`: ShipProof finding id.
- `level`: `error` for high severity, `warning` for medium, `note` for low.
- `locations`: source file plus line and column when available.

## Agent Feedback Prompt

`agentFeedbackPrompt` is `null` for clean `ship` reports. For `review` and `no-ship` reports, it contains a concise prompt that can be pasted back into a coding agent.

The prompt includes:

- Current decision, score, and status.
- Failed or incomplete checks.
- Security findings.
- Risk areas.
- Suggested next tests.
- Scope constraints.
- A ShipProof rerun command with the changed file list when available.
