# Security-Lite

Security-lite is a cheap production-readiness gate for common AI-code mistakes. It is not a full SAST scanner.

## Findings

ShipProof currently checks for:

- committed runtime `.env` files
- likely committed secrets in assignment-style config
- public client variables that include secret/token/private-key names
- wildcard CORS
- auth-sensitive path changes
- public Supabase storage buckets
- disabled Supabase/Postgres row level security
- broad `anon` write policies in SQL migrations

Each finding includes:

- `id`
- `severity`
- `file`
- `line` and `column` when available
- redacted `snippet` when source context is safe to show
- `message`
- `allowlistHint`

Secret values are redacted in snippets and are not copied into messages.

## Allowlist

Use `security.allow` only for intentional exceptions. Each entry should include a reason and expiry.

```json
{
  "security": {
    "allow": [
      {
        "id": "unsafe-cors",
        "file": "src/api/public-demo/route.ts",
        "line": 12,
        "reason": "Public demo endpoint without credentials.",
        "expiresAt": "2026-07-01"
      }
    ]
  }
}
```

Allowlist matching supports:

- exact `id`
- exact `file`
- optional exact `line`
- `*` wildcards in `id` and `file`

Expired entries and entries without `reason` do not suppress findings.

## Baseline

Use `security.baseline` for known existing findings that should remain visible without blocking new work.

```json
{
  "security": {
    "baseline": [
      {
        "id": "unsafe-cors",
        "file": "src/api/legacy/route.ts",
        "line": 12,
        "reason": "Legacy endpoint tracked until auth rewrite.",
        "expiresAt": "2026-08-01"
      }
    ]
  }
}
```

Baseline matching uses the same `id`, `file`, optional `line`, `reason`, `expiresAt`, and wildcard rules as `security.allow`.

Matched baseline findings stay in Markdown and JSON reports with `status: "baseline"`, but they do not fail `security-lite`, reduce the ship score, or appear in SARIF. Expired baseline entries become active findings again.

## Severity Overrides

Use `security.severity` to tune finding severity by ID:

```json
{
  "security": {
    "severity": {
      "unsafe-cors": "medium",
      "public-storage-policy": "high"
    }
  }
}
```

Supported severity values are `high`, `medium`, and `low`. Invalid override values are ignored.

## SARIF

GitHub Action mode writes SARIF security-lite results to `shipproof-security.sarif` by default. Override it with:

```yaml
- uses: kingkyylian/shipproof@v0.2.0
  with:
    github-token: ${{ github.token }}
    security-sarif-path: artifacts/shipproof-security.sarif
```

Local mode writes SARIF only when requested:

```sh
npm run shipproof -- --changed src/api/route.ts --no-browser --security-sarif-path /tmp/shipproof-security.sarif
```

The SARIF file uses SARIF `2.1.0` and maps high findings to `error`, medium findings to `warning`, and low findings to `note`.
