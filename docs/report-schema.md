# ShipProof Report Schema

Current schema version: `1.0`

ShipProof writes two report views:

- `shipproof-report.md`: human-readable PR comment and step summary.
- `shipproof-report.json`: machine-readable payload for automation.

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
  "message": "Wildcard CORS allows any origin."
}
```

Future schema versions may add line numbers, allowlist metadata, and SARIF references.
