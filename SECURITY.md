# Security Policy

ShipProof is a verification tool for pull request changes. Treat reports as decision support, not as a complete security audit or replacement for deeper application security review.

## Supported Versions

Until the first public release, only the current `main` branch is supported.

After `v0.1.0`, security fixes will target the latest minor release.

## Reporting a Vulnerability

Do not open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting or private security advisory flow for the repository when available. Include:

- Affected version or commit.
- Minimal reproduction steps.
- Expected and actual behavior.
- Whether the issue can expose secrets, bypass checks, or mislead a merge decision.

## Scope

In scope:

- Token or secret exposure caused by ShipProof.
- Incorrect pass/ship decisions caused by ShipProof logic.
- GitHub Action permission or PR comment behavior that can leak private data.
- Browser smoke behavior that writes sensitive artifacts unexpectedly.

Out of scope:

- Findings in applications scanned by ShipProof.
- False positives or false negatives in security-lite heuristics unless they create a systemic unsafe decision.
- Vulnerabilities in third-party CI, GitHub, Playwright, or package manager infrastructure.
