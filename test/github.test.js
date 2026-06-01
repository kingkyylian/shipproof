import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCommentBody,
  createGitHubRequest,
  getPullRequestContext,
  listPullRequestFiles,
  upsertShipProofComment
} from "../src/github.js";

describe("getPullRequestContext", () => {
  it("extracts owner, repo, and pull number from a pull_request event", () => {
    const context = getPullRequestContext(
      {
        pull_request: {
          number: 42,
          head: { sha: "abc123" }
        }
      },
      { GITHUB_REPOSITORY: "acme/demo" }
    );

    assert.deepEqual(context, {
      owner: "acme",
      repo: "demo",
      pullNumber: 42,
      headSha: "abc123"
    });
  });

  it("returns null when the event is not a pull request", () => {
    assert.equal(getPullRequestContext({ ref: "refs/heads/main" }, { GITHUB_REPOSITORY: "acme/demo" }), null);
  });
});

describe("listPullRequestFiles", () => {
  it("collects changed filenames across paginated GitHub responses", async () => {
    const requestedPaths = [];
    const files = await listPullRequestFiles({
      context: { owner: "acme", repo: "demo", pullNumber: 42 },
      request: async (path) => {
        requestedPaths.push(path);

        if (path.endsWith("page=1")) {
          return [
            { filename: "src/app/page.tsx" },
            { filename: "middleware.ts" }
          ];
        }

        return [];
      }
    });

    assert.deepEqual(requestedPaths, [
      "/repos/acme/demo/pulls/42/files?per_page=100&page=1",
      "/repos/acme/demo/pulls/42/files?per_page=100&page=2"
    ]);
    assert.deepEqual(files, ["src/app/page.tsx", "middleware.ts"]);
  });
});

describe("upsertShipProofComment", () => {
  it("updates an existing ShipProof comment when the marker is present", async () => {
    const calls = [];
    const result = await upsertShipProofComment({
      context: { owner: "acme", repo: "demo", pullNumber: 42 },
      markdown: "# ShipProof Report\n\n**Status:** passed\n",
      request: async (path, options = {}) => {
        calls.push({ path, options });

        if (path === "/repos/acme/demo/issues/42/comments?per_page=100") {
          return [
            { id: 7, body: "hello" },
            { id: 8, body: "<!-- shipproof-report -->\nold report" }
          ];
        }

        return { id: 8 };
      }
    });

    assert.equal(result.action, "updated");
    assert.deepEqual(calls, [
      { path: "/repos/acme/demo/issues/42/comments?per_page=100", options: {} },
      {
        path: "/repos/acme/demo/issues/comments/8",
        options: {
          method: "PATCH",
          body: { body: buildCommentBody("# ShipProof Report\n\n**Status:** passed\n") }
        }
      }
    ]);
  });

  it("creates a new ShipProof comment when no marker is present", async () => {
    const calls = [];
    const result = await upsertShipProofComment({
      context: { owner: "acme", repo: "demo", pullNumber: 42 },
      markdown: "# ShipProof Report\n",
      request: async (path, options = {}) => {
        calls.push({ path, options });

        if (path === "/repos/acme/demo/issues/42/comments?per_page=100") {
          return [];
        }

        return { id: 9 };
      }
    });

    assert.equal(result.action, "created");
    assert.equal(calls[1].path, "/repos/acme/demo/issues/42/comments");
    assert.equal(calls[1].options.method, "POST");
    assert.equal(calls[1].options.body.body, buildCommentBody("# ShipProof Report\n"));
  });
});

describe("createGitHubRequest", () => {
  it("sends authenticated GitHub JSON requests", async () => {
    const calls = [];
    const request = createGitHubRequest({
      token: "ghs_test",
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true })
        };
      }
    });

    const response = await request("/repos/acme/demo/issues/42/comments", {
      method: "POST",
      body: { body: "hello" }
    });

    assert.deepEqual(response, { ok: true });
    assert.equal(calls[0].url, "https://api.github.com/repos/acme/demo/issues/42/comments");
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.headers.Authorization, "Bearer ghs_test");
    assert.equal(calls[0].options.body, JSON.stringify({ body: "hello" }));
  });

  it("can target a custom API base URL for integration verification", async () => {
    const calls = [];
    const request = createGitHubRequest({
      token: "ghs_test",
      baseUrl: "http://127.0.0.1:9876/api/",
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true })
        };
      }
    });

    await request("/repos/acme/demo/pulls/42/files?per_page=100&page=1");

    assert.equal(calls[0].url, "http://127.0.0.1:9876/api/repos/acme/demo/pulls/42/files?per_page=100&page=1");
  });

  it("surfaces GitHub API errors with path and status", async () => {
    const request = createGitHubRequest({
      token: "ghs_test",
      fetchImpl: async () => ({
        ok: false,
        status: 403,
        text: async () => "Resource not accessible by integration"
      })
    });

    await assert.rejects(
      () => request("/repos/acme/demo/issues/42/comments"),
      /GitHub API 403 for \/repos\/acme\/demo\/issues\/42\/comments: Resource not accessible by integration/
    );
  });
});
