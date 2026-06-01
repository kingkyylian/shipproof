# Dogfood PR

This file exists to verify ShipProof against its own GitHub Action workflow.

Expected proof path:

- GitHub Actions runs `.github/workflows/shipproof.yml`.
- The local action entrypoint runs `bin/shipproof.js github`.
- ShipProof writes Markdown and JSON report artifacts.
- ShipProof creates or updates one PR comment marked with `<!-- shipproof-report -->`.
