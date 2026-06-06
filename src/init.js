import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export async function createInitPlan({ root, dryRun = false }) {
  const files = [
    {
      path: ".github/workflows/shipproof.yml",
      contents: [
        "name: ShipProof",
        "",
        "on:",
        "  pull_request:",
        "",
        "permissions:",
        "  contents: read",
        "  issues: write",
        "  pull-requests: write",
        "",
        "jobs:",
        "  proof:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - uses: actions/checkout@v4",
        "      - uses: kingkyylian/shipproof@v0.3.0",
        "        with:",
        "          github-token: ${{ github.token }}",
        ""
      ].join("\n")
    },
    {
      path: "shipproof.config.json",
      contents: "{\n  \"browser\": {\n    \"required\": false\n  }\n}\n"
    }
  ];

  if (dryRun) {
    return { root, files, written: [] };
  }

  for (const file of files) {
    const target = path.join(root, file.path);

    if (await pathExists(target)) {
      throw new Error(`Already exists: ${file.path}; refusing to overwrite.`);
    }
  }

  const written = [];

  for (const file of files) {
    const target = path.join(root, file.path);

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.contents);
    written.push(file.path);
  }

  return { root, files, written };
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
