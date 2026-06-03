# Browser Smoke

ShipProof can run a small Playwright smoke test for changed frontend routes.

Supported automatic framework detection:

- Next.js
- Vite

## What It Checks

- Starts or reuses a dev server.
- Waits for a readiness URL.
- Opens inferred and configured routes in Chromium.
- Fails on browser console errors, page errors, and HTTP responses with status `>= 400`.
- Captures screenshots for checked routes.
- Captures dev server stdout and stderr logs when ShipProof starts the server.

## Config

```json
{
  "browser": {
    "enabled": true,
    "required": true,
    "baseUrl": null,
    "routes": ["/settings"],
    "screenshotDir": "shipproof-screenshots",
    "logDir": "shipproof-browser-logs",
    "readyUrl": null,
    "timeoutMs": 30000,
    "waitUntil": "networkidle"
  }
}
```

## CLI Overrides

```sh
npm run shipproof -- \
  --changed src/app/settings/page.tsx \
  --browser-base-url http://127.0.0.1:3000 \
  --browser-ready-url http://127.0.0.1:3000/health \
  --browser-timeout-ms 15000 \
  --browser-wait-until domcontentloaded \
  --screenshot-dir shipproof-screenshots \
  --browser-log-dir shipproof-browser-logs
```

## GitHub Action Overrides

```yaml
- uses: kingkyylian/shipproof@v0.2.0
  with:
    github-token: ${{ github.token }}
    browser-base-url: http://127.0.0.1:3000
    browser-ready-url: http://127.0.0.1:3000/health
    browser-timeout-ms: 15000
    browser-wait-until: domcontentloaded
    browser-log-dir: shipproof-browser-logs
```

## Playwright Policy

ShipProof loads `playwright` or `@playwright/test` from the target project.

- If `browser.required` is `true`, missing Playwright fails the proof.
- If `browser.required` is `false`, missing Playwright marks browser smoke as `not_checked`.

This lets teams start with advisory browser smoke and later make it required.

## Artifacts

Default browser artifacts:

- Screenshots: `shipproof-screenshots/`
- Dev server stdout: `shipproof-browser-logs/server.stdout.log`
- Dev server stderr: `shipproof-browser-logs/server.stderr.log`

When a route fails, the proof summary includes the first browser error and the screenshot/log directories.

Local `--screenshot-dir` and `--browser-log-dir` flags override the default artifact directories.
