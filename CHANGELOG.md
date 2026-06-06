# Changelog

All notable changes to ShipProof will be documented in this file.

The format follows Keep a Changelog style categories, and this project uses semantic versioning once public releases begin.

## Unreleased

### Added

- `shipproof init --dry-run` now previews starter workflow and config files for first-time setup.
- Config loading now rejects invalid `browser.waitUntil` values before running proof checks.

## 0.3.0 - 2026-06-04

### Added

- Release operations docs and a post-release verification helper for tag and GitHub release audits.
- Beta feedback contract, v0.3 evidence targets, and a report audit helper for proof JSON summaries.
- Merge Signal summary in ShipProof reports for faster pull request scanning.
- Browser smoke route results in JSON reports.
- Security-lite Supabase SQL heuristics for public storage buckets, disabled RLS, and broad `anon` writes.
- Security severity overrides in `shipproof.config.json`.
- npm publishing readiness plan and a local `publish:dry-run` gate.

### Changed

- Browser smoke startup failures now include recent dev-server stdout and stderr excerpts.
- Release readiness now targets the `v0.3.0` release-candidate contract.
- Package bin metadata now uses npm's normalized `bin/shipproof.js` form.
- GitHub Action docs now point new installs at the `v0.3.0` target tag.

### Fixed

- Security-lite Supabase SQL heuristics no longer flag SQL examples embedded in non-SQL files.

## 0.2.0 - 2026-06-02

### Added

- Agent feedback prompts for `review` and `no-ship` reports.
- Browser smoke server logs, readiness controls, route timeouts, and advisory missing-Playwright handling.
- Beta test matrix covering six successful external reports, browser advisory and required Playwright render reports, and one caught failure example.
- Deterministic `release:readiness` contract gate for `v0.2.0` manifest, lockfile, package/action entrypoints, docs, release notes, and action wiring.
- Reusable `pack:smoke` gate that packs the release tarball, runs the packed CLI, and verifies JSON/SARIF artifacts.
- Release readiness checklist for the `v0.2.0` tag and GitHub release gate.
- Security-lite line numbers, redacted snippets, allowlist policy, and SARIF output.
- Security-lite baseline findings for visible non-blocking lifecycle tracking.
- Monorepo workspace detection with package-local proof commands and workspace browser smoke planning.
- Report UX sections for failed check excerpts, concrete rerun commands, and generated artifact references.

### Changed

- Release docs now point new GitHub Action installs at `kingkyylian/shipproof@v0.2.0`.
- Added a repository lockfile so release checks can run `npm audit`.

### Fixed

- Failed executed optional checks no longer produce clean `ship` reports.
- Root package-manager detection now applies to single-package repositories, not only workspace package checks.
- Browser smoke root dev commands now use the detected package manager.
- Local `--screenshot-dir` is preserved in browser artifact reports when config defaults are loaded.

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
