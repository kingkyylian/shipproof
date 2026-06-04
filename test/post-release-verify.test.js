import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const moduleUrl = pathToFileURL(path.join(repoRoot, "scripts", "post-release-verify.mjs")).href;

describe("post release verification", () => {
  it("parses release verification JSON from command output", async () => {
    const { parseReleaseView } = await import(moduleUrl);

    const parsed = parseReleaseView(JSON.stringify({
      tagName: "v0.2.0",
      name: "ShipProof v0.2.0",
      url: "https://github.com/kingkyylian/shipproof/releases/tag/v0.2.0",
      isDraft: false,
      isPrerelease: false,
      publishedAt: "2026-06-03T11:17:35Z",
      targetCommitish: "main"
    }));

    assert.equal(parsed.tagName, "v0.2.0");
    assert.equal(parsed.isDraft, false);
    assert.equal(parsed.isPrerelease, false);
  });
});
