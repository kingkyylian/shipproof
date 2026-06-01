# Live GitHub Verification

Use this after `gh auth status` shows a valid token with access to a test repository.

## Preconditions

- The current machine is authenticated with GitHub.
- A test repository exists.
- A pull request is open in that repository.
- The repository has a Node project with `package.json`.

## Verify Auth

```sh
gh auth status
```

## Run The Action Path Locally

Set these values for the target pull request:

```sh
export GITHUB_REPOSITORY="OWNER/REPO"
export GITHUB_TOKEN="$(gh auth token)"
export GITHUB_EVENT_PATH="/tmp/shipproof-pr-event.json"
export INPUT_REPORT_PATH="/tmp/shipproof-live-report.md"
export GITHUB_STEP_SUMMARY="/tmp/shipproof-live-summary.md"
```

Create the event payload:

```sh
printf '{"pull_request":{"number":PR_NUMBER,"head":{"sha":"HEAD_SHA"}}}\n' > "$GITHUB_EVENT_PATH"
```

Run ShipProof:

```sh
node /Users/kyylian/shipproof/bin/shipproof.js github
```

## Expected Evidence

- The command exits `0` for a passing proof or `1` for a real proof failure.
- `/tmp/shipproof-live-report.md` contains `# ShipProof Report`.
- `/tmp/shipproof-live-summary.md` contains `# ShipProof Report`.
- The pull request has one ShipProof comment containing `<!-- shipproof-report -->`.
- Re-running the command updates the same comment rather than creating duplicates.

## Current Local Substitute

When live GitHub auth is unavailable, run:

```sh
npm run smoke:github-mock
```

This starts a local mock GitHub API and verifies PR file lookup, artifact writing, step summary writing, and PR comment creation through the real `shipproof github` CLI path.
