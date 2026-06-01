# ShipProof Configuration

ShipProof works without a config file. Add `shipproof.config.json` when a repository needs explicit policy.

## Example

```json
{
  "$schema": "https://shipproof.dev/schema/v1.json",
  "checks": {
    "lint": "optional",
    "typecheck": "optional",
    "test": "required",
    "build": "required"
  },
  "browser": {
    "enabled": true,
    "required": true,
    "baseUrl": null,
    "routes": [],
    "screenshotDir": "shipproof-screenshots"
  },
  "security": {
    "enabled": true,
    "allow": []
  },
  "score": {
    "ship": 80,
    "review": 60
  },
  "reports": {
    "markdown": "shipproof-report.md",
    "json": "shipproof-report.json"
  }
}
```

## CLI

```sh
npm run shipproof -- --config shipproof.config.json --changed src/core.js --no-browser
```

## GitHub Action

Use `config-path` to pass the same config into GitHub mode:

```yaml
- uses: kingkyylian/shipproof@v0.1.0
  with:
    github-token: ${{ github.token }}
    config-path: shipproof.config.json
```

Action inputs still override CI-specific values such as report paths, browser base URL, and screenshot directory.

## Policy

- `checks.*`: use `"required"` or `"optional"` for discovered package scripts.
- `browser.enabled`: disables browser smoke planning when `false`.
- `browser.required`: controls whether browser smoke is a required proof check.
- `browser.routes`: adds explicit routes to inferred routes.
- `security.enabled`: disables security-lite checks when `false`.
- `score.ship`: minimum score for `ship`.
- `score.review`: minimum score before `no-ship`.
- `reports.markdown`: default Markdown artifact path in GitHub mode.
- `reports.json`: default JSON artifact path in GitHub mode.
