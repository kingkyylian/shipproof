# Monorepo Support

ShipProof can target changed workspace packages instead of running only root checks.

## Detection

Package manager detection uses repository lockfiles:

- `pnpm-lock.yaml`: `pnpm`
- `package-lock.json`: `npm`
- `yarn.lock`: `yarn`
- `bun.lockb`: `bun`

Workspace detection reads:

- `package.json#workspaces`
- `pnpm-workspace.yaml`

Supported workspace globs are exact package paths and one-level globs such as `apps/*` and `packages/*`.

## Package Mapping

Changed files are mapped to workspace package roots. For example:

```text
apps/web/src/App.tsx -> apps/web
services/api/src/server.ts -> services/api
```

When changed workspace packages are found, ShipProof runs package-local proof commands by default:

```sh
npm --workspace web test
npm --workspace web run build
pnpm --filter web test
pnpm --filter web build
```

Single-package repositories use detected root commands such as `npm test`, `npm run build`, `pnpm test`, and `pnpm build`.

## Root Checks

Root checks are skipped by default when changed workspace packages are found. Force root checks with:

```json
{
  "workspace": {
    "includeRoot": true
  }
}
```

Disable workspace targeting entirely with:

```json
{
  "workspace": {
    "enabled": false
  }
}
```

## Browser Smoke

For changed frontend workspace packages, ShipProof builds package-local dev commands and loads Playwright from the owning package:

```sh
pnpm --filter web dev -- --host 127.0.0.1 --port 4173
```

If no changed workspace package owns a browser route, ShipProof falls back to the root browser smoke behavior.
Root browser smoke also uses the detected package manager for dev commands, for example `pnpm dev -- --host 127.0.0.1 --port 4173`.
