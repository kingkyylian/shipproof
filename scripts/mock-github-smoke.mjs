import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const tempDir = await mkdtemp(path.join(tmpdir(), "shipproof-gh-smoke-"));
const eventPath = path.join(tempDir, "event.json");
const reportPath = path.join(tempDir, "report.md");
const jsonReportPath = path.join(tempDir, "report.json");
const summaryPath = path.join(tempDir, "summary.md");
const calls = [];
const comments = [];

await writeFile(
  eventPath,
  JSON.stringify({
    pull_request: {
      number: 42,
      head: { sha: "abc123" }
    }
  })
);

const server = createServer(async (request, response) => {
  const body = await readBody(request);
  const url = new URL(request.url, "http://127.0.0.1");

  calls.push({ method: request.method, path: `${url.pathname}${url.search}`, body });

  if (request.method === "GET" && url.pathname === "/repos/acme/demo/pulls/42/files") {
    const page = url.searchParams.get("page");
    return sendJson(response, page === "1" ? [{ filename: "middleware.ts" }] : []);
  }

  if (request.method === "GET" && url.pathname === "/repos/acme/demo/issues/42/comments") {
    return sendJson(response, comments);
  }

  if (request.method === "POST" && url.pathname === "/repos/acme/demo/issues/42/comments") {
    const parsed = JSON.parse(body);
    const comment = { id: 1, body: parsed.body };
    comments.push(comment);
    return sendJson(response, comment, 201);
  }

  return sendJson(response, { error: "not found" }, 404);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

try {
  const { port } = server.address();
  const result = await runCli({
    env: {
      ...process.env,
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_REPOSITORY: "acme/demo",
      INPUT_GITHUB_TOKEN: "ghs_mock",
      INPUT_GITHUB_API_URL: `http://127.0.0.1:${port}`,
      INPUT_REPORT_PATH: reportPath,
      INPUT_JSON_REPORT_PATH: jsonReportPath,
      GITHUB_STEP_SUMMARY: summaryPath,
      INPUT_BROWSER_SMOKE: "false"
    }
  });

  assert(result.code === 0, `shipproof github exited ${result.code}\n${result.stdout}\n${result.stderr}`);
  assert(comments.length === 1, "expected one created PR comment");
  assert(comments[0].body.includes("<!-- shipproof-report -->"), "expected ShipProof marker in comment body");
  assert(comments[0].body.includes("# ShipProof Report"), "expected markdown report in comment body");
  assert(calls.some((call) => call.method === "GET" && call.path.includes("/pulls/42/files")), "expected PR files request");
  assert(calls.some((call) => call.method === "POST" && call.path === "/repos/acme/demo/issues/42/comments"), "expected comment create request");
  assert((await readFile(reportPath, "utf8")).includes("**Decision:** review"), "expected markdown report artifact");
  assert(JSON.parse(await readFile(jsonReportPath, "utf8")).schemaVersion === "1.0", "expected JSON report artifact");
  assert((await readFile(summaryPath, "utf8")).includes("# ShipProof Report"), "expected step summary output");

  console.log("mock GitHub smoke passed");
} finally {
  server.close();
}

function runCli({ env }) {
  return new Promise((resolve) => {
    const child = spawn("node", ["bin/shipproof.js", "github"], {
      cwd: projectRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

function readBody(request) {
  return new Promise((resolve) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk.toString();
    });
    request.on("end", () => {
      resolve(body);
    });
  });
}

function sendJson(response, value, statusCode = 200) {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
