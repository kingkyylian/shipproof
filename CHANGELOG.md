# Changelog

All notable changes to ShipProof will be documented in this file.

The format follows Keep a Changelog style categories, and this project uses semantic versioning once public releases begin.

## Unreleased

No changes yet.

## 0.2.0 - 2026-06-02

### Added

- Agent feedback prompts for `review` and `no-ship` reports.
- Browser smoke server logs, readiness controls, route timeouts, and advisory missing-Playwright handling.
- Security-lite line numbers, redacted snippets, allowlist policy, and SARIF output.
- Monorepo workspace detection with package-local proof commands and workspace browser smoke planning.

### Changed

- Release docs now point new GitHub Action installs at `kingkyylian/shipproof@v0.2.0`.
- Added a repository lockfile so release checks can run `npm audit`.

## 0.1.0 - 2026-06-01

### Added

- Initial ShipProof CLI for local proof reports.
- GitHub Action entrypoint for pull request proof comments.
- Risk classification for auth, database, payment, backend, config, dependency, and frontend changes.
- Security-lite checks for committed env files, likely secrets, public client secrets, wildcard CORS, and auth-sensitive paths.
- Browser smoke checks for detected Next.js and Vite projects.
- Optional `shipproof.config.json` policy loading.
- JSON report payloads with `schemaVersion: "1.0"`.
- GitHub Action JSON report artifact input.
- Graceful fallback when PR comment permissions are unavailable.
- Mock GitHub API smoke test and live GitHub API verification notes.
