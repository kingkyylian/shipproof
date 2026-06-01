#!/usr/bin/env node

import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { runGitHubProof } from "../src/action.js";
import { createBrowserSmokePlan, runBrowserSmoke } from "../src/browser.js";
import { runProof } from "../src/core.js";
import { createGitHubRequest } from "../src/github.js";
import { scanSecurityFindingsFromDisk } from "../src/security.js";

const cwd = process.cwd();
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log([
    "Usage: shipproof [run|github] [--changed <file[,file...]>]",
    "",
    "Runs proof checks discovered from package.json and prints a merge-facing markdown report.",
    "Local mode: if --changed is omitted, ShipProof reads changed files from git diff --name-only HEAD.",
    "GitHub mode: reads PR files from the GitHub API and writes shipproof-report.md.",
    "",
    "Browser options:",
    "  --no-browser              Disable browser smoke checks.",
    "  --browser-base-url <url>  Reuse an existing dev server instead of starting one.",
    "  --screenshot-dir <path>   Screenshot output directory. Default: shipproof-screenshots."
  ].join("\n"));
  process.exit(0);
}

const mode = args[0] === "github" ? "github" : "local";

if (args[0] === "run" || args[0] === "github") {
  args.shift();
}

try {
  if (mode === "github") {
    const result = await runGitHubMode(args);
    console.log(result.report.markdown);
    console.error(`ShipProof report written to ${result.reportPath}; PR comment ${result.commentAction}.`);
    process.exitCode = result.report.status === "failed" ? 1 : 0;
  } else {
    const report = await runLocalMode(args);
    console.log(report.markdown);
    process.exitCode = report.status === "failed" ? 1 : 0;
  }
} catch (error) {
  console.error(`ShipProof failed: ${error.message}`);
  process.exitCode = 2;
}

async function runLocalMode(values) {
  const packageJson = await readPackageJson(cwd);
  const changedFiles = parseChangedFiles(values) ?? readChangedFilesFromGit(cwd);
  const browserPlan = createCliBrowserPlan({ packageJson, changedFiles, values });

  return runProof({
    packageJson,
    changedFiles,
    executeCommand: (command) => executeCommand(command, cwd),
    securityScan: () => scanSecurityFindingsFromDisk({ changedFiles, cwd }),
    browserSmoke: browserPlan ? () => runBrowserSmoke({ plan: browserPlan }) : null
  });
}

async function runGitHubMode(values) {
  const packageJson = await readPackageJson(cwd);
  const event = await readGitHubEvent(process.env);
  const token = process.env.INPUT_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  const request = createGitHubRequest({
    token,
    baseUrl: process.env.INPUT_GITHUB_API_URL || process.env.GITHUB_API_URL
  });
  const changedOverride = parseChangedFiles(values);

  return runGitHubProof({
    packageJson,
    event,
    env: process.env,
    changedFiles: changedOverride,
    executeCommand: (command) => executeCommand(command, cwd),
    securityScan: ({ changedFiles } = {}) => scanSecurityFindingsFromDisk({ changedFiles: changedFiles ?? changedOverride ?? [], cwd }),
    request,
    writeReport: writeReportFile,
    appendSummary: process.env.GITHUB_STEP_SUMMARY
      ? (markdown) => appendFile(process.env.GITHUB_STEP_SUMMARY, markdown)
      : null
  });
}

async function readPackageJson(directory) {
  const file = await readFile(path.join(directory, "package.json"), "utf8");
  return JSON.parse(file);
}

function parseChangedFiles(values) {
  const changed = [];

  for (let index = 0; index < values.length; index += 1) {
    if (values[index] !== "--changed") {
      continue;
    }

    const value = values[index + 1];
    if (!value) {
      throw new Error("--changed requires a file path or comma-separated file list");
    }

    changed.push(...value.split(",").map((file) => file.trim()).filter(Boolean));
    index += 1;
  }

  return changed.length > 0 ? changed : null;
}

function createCliBrowserPlan({ packageJson, changedFiles, values }) {
  if (values.includes("--no-browser") || process.env.SHIPPROOF_BROWSER_SMOKE === "false") {
    return null;
  }

  return createBrowserSmokePlan({
    packageJson,
    changedFiles,
    baseUrl: readOption(values, "--browser-base-url") || process.env.SHIPPROOF_BROWSER_BASE_URL || undefined,
    screenshotDir: readOption(values, "--screenshot-dir") || process.env.SHIPPROOF_SCREENSHOT_DIR || "shipproof-screenshots"
  });
}

function readOption(values, name) {
  const index = values.indexOf(name);

  if (index === -1) {
    return null;
  }

  const value = values[index + 1];
  if (!value) {
    throw new Error(`${name} requires a value`);
  }

  return value;
}

function readChangedFilesFromGit(directory) {
  try {
    return execFileSync("git", ["diff", "--name-only", "HEAD"], {
      cwd: directory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    })
      .split("\n")
      .map((file) => file.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function readGitHubEvent(env) {
  if (!env.GITHUB_EVENT_PATH) {
    throw new Error("GITHUB_EVENT_PATH is required in github mode");
  }

  return JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"));
}

async function writeReportFile(file, markdown) {
  const directory = path.dirname(path.resolve(cwd, file));

  await mkdir(directory, { recursive: true });
  await writeFile(path.resolve(cwd, file), markdown);
}

function executeCommand(command, directory) {
  const startedAt = performance.now();

  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd: directory,
      shell: true,
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
      resolve({
        exitCode: code ?? 1,
        durationMs: Math.round(performance.now() - startedAt),
        stdout,
        stderr
      });
    });
  });
}
