import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { createInitPlan } from "../src/init.js";

describe("shipproof init", () => {
  it("returns the files it would create without writing them in dry-run mode", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "shipproof-init-"));

    try {
      const plan = await createInitPlan({ root, dryRun: true });

      assert.deepEqual(plan.files.map((file) => file.path), [
        ".github/workflows/shipproof.yml",
        "shipproof.config.json"
      ]);
      assert.equal(plan.written.length, 0);
      assert.match(plan.files[0].contents, /uses: kingkyylian\/shipproof@v0\.3\.0/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses to overwrite existing workflow files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "shipproof-init-"));
    await mkdir(path.join(root, ".github", "workflows"), { recursive: true });
    await writeFile(path.join(root, ".github", "workflows", "shipproof.yml"), "existing\n");

    try {
      await assert.rejects(
        () => createInitPlan({ root, dryRun: false }),
        /already exists.*shipproof\.yml/i
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("writes the starter workflow and config when dry-run mode is disabled", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "shipproof-init-"));

    try {
      const plan = await createInitPlan({ root, dryRun: false });

      assert.deepEqual(plan.written, [
        ".github/workflows/shipproof.yml",
        "shipproof.config.json"
      ]);
      assert.match(
        await readFile(path.join(root, ".github", "workflows", "shipproof.yml"), "utf8"),
        /uses: kingkyylian\/shipproof@v0\.3\.0/
      );
      assert.match(
        await readFile(path.join(root, "shipproof.config.json"), "utf8"),
        /"required": false/
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
