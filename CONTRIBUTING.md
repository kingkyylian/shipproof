# Contributing

ShipProof is early. Keep changes narrow and proof-oriented.

## Local Setup

```sh
npm test
npm run smoke:github-mock
npm run shipproof -- --changed src/core.js,test/core.test.js --no-browser
```

The project currently has no runtime dependencies. Do not add a dependency unless it clearly improves correctness or removes meaningful complexity.

## Development Rules

- Keep the CLI, GitHub Action, and report output deterministic.
- Add or update focused tests for behavior changes.
- Do not weaken required checks without an explicit product decision.
- Do not include secret values in fixtures, reports, logs, or error messages.
- Keep PR comments idempotent; reruns should update one ShipProof comment.

## Verification

Before opening a PR, run:

```sh
npm test
npm run smoke:github-mock
```

For browser smoke changes, verify against a real local Next.js or Vite app when practical.
