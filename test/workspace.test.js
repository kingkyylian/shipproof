import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  detectPackageManager,
  extractWorkspaceGlobs,
  formatRootCommand,
  formatWorkspaceCommand,
  loadWorkspaceContext,
  mapChangedFilesToWorkspacePackages
} from "../src/workspace.js";

describe("detectPackageManager", () => {
  it("detects package managers from lockfiles with npm fallback", () => {
    assert.equal(detectPackageManager({ files: ["pnpm-lock.yaml"] }), "pnpm");
    assert.equal(detectPackageManager({ files: ["package-lock.json"] }), "npm");
    assert.equal(detectPackageManager({ files: ["yarn.lock"] }), "yarn");
    assert.equal(detectPackageManager({ files: ["bun.lockb"] }), "bun");
    assert.equal(detectPackageManager({ files: [] }), "npm");
  });
});

describe("extractWorkspaceGlobs", () => {
  it("reads workspaces from package.json arrays and objects", () => {
    assert.deepEqual(
      extractWorkspaceGlobs({
        packageJson: {
          workspaces: ["apps/*", "packages/*"]
        }
      }),
      ["apps/*", "packages/*"]
    );

    assert.deepEqual(
      extractWorkspaceGlobs({
        packageJson: {
          workspaces: {
            packages: ["services/*"]
          }
        }
      }),
      ["services/*"]
    );
  });

  it("reads simple pnpm-workspace package globs", () => {
    assert.deepEqual(
      extractWorkspaceGlobs({
        packageJson: {},
        pnpmWorkspaceYaml: [
          "packages:",
          "  - apps/*",
          "  - 'packages/*'",
          "  - \"tools/cli\""
        ].join("\n")
      }),
      ["apps/*", "packages/*", "tools/cli"]
    );
  });
});

describe("mapChangedFilesToWorkspacePackages", () => {
  it("maps changed files to owning package roots", () => {
    const packages = [
      { name: "web", root: "apps/web", packageJson: { scripts: { test: "vitest" } } },
      { name: "api", root: "services/api", packageJson: { scripts: { test: "node --test" } } }
    ];

    assert.deepEqual(
      mapChangedFilesToWorkspacePackages({
        packages,
        changedFiles: ["apps/web/src/app/page.tsx", "services/api/src/server.ts", "README.md"]
      }),
      packages
    );
  });
});

describe("formatWorkspaceCommand", () => {
  it("formats npm and pnpm package-local script commands", () => {
    assert.equal(
      formatWorkspaceCommand({ packageManager: "npm", workspace: "web", script: "test" }),
      "npm --workspace web test"
    );
    assert.equal(
      formatWorkspaceCommand({ packageManager: "npm", workspace: "web", script: "build" }),
      "npm --workspace web run build"
    );
    assert.equal(
      formatWorkspaceCommand({ packageManager: "pnpm", workspace: "web", script: "test" }),
      "pnpm --filter web test"
    );
  });
});

describe("formatRootCommand", () => {
  it("keeps npm root commands as default and supports pnpm roots", () => {
    assert.equal(formatRootCommand({ script: "test" }), "npm test");
    assert.equal(formatRootCommand({ script: "build" }), "npm run build");
    assert.equal(formatRootCommand({ packageManager: "pnpm", script: "test" }), "pnpm test");
  });
});

describe("loadWorkspaceContext", () => {
  it("loads package.json workspaces and maps changed packages", async () => {
    const files = new Map([
      ["/repo/package-lock.json", ""],
      ["/repo/apps/web/package.json", JSON.stringify({ name: "web", scripts: { test: "vitest", build: "vite build" } })],
      ["/repo/apps/admin/package.json", JSON.stringify({ name: "admin", scripts: { test: "vitest" } })]
    ]);

    const context = await loadWorkspaceContext({
      cwd: "/repo",
      packageJson: {
        workspaces: ["apps/*"]
      },
      changedFiles: ["apps/web/src/App.tsx"],
      fileExists: async (file) => files.has(file),
      readdir: async (directory) => {
        assert.equal(directory, "/repo/apps");
        return [
          { name: "web", isDirectory: () => true },
          { name: "admin", isDirectory: () => true }
        ];
      },
      readFile: async (file) => files.get(file)
    });

    assert.deepEqual(context, {
      packageManager: "npm",
      packages: [
        { name: "web", root: "apps/web", packageJson: { name: "web", scripts: { test: "vitest", build: "vite build" } } },
        { name: "admin", root: "apps/admin", packageJson: { name: "admin", scripts: { test: "vitest" } } }
      ],
      changedPackages: [
        { name: "web", root: "apps/web", packageJson: { name: "web", scripts: { test: "vitest", build: "vite build" } } }
      ]
    });
  });

  it("ignores workspace globs whose base directory is missing", async () => {
    const context = await loadWorkspaceContext({
      cwd: "/repo",
      packageJson: {
        workspaces: ["apps/*"]
      },
      changedFiles: ["README.md"],
      fileExists: async () => false,
      readdir: async () => {
        throw new Error("ENOENT");
      },
      readFile: async () => ""
    });

    assert.deepEqual(context, {
      packageManager: "npm",
      packages: [],
      changedPackages: []
    });
  });
});
