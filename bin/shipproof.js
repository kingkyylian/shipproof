#!/usr/bin/env node

import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { runGitHubProof } from "../src/action.js";
import { createBrowserSmokePlan, runBrowserSmoke } from "../src/browser.js";
import { loadShipProofConfig } from "../src/config.js";
import { attachReportArtifacts, runProof } from "../src/core.js";
import { createGitHubRequest } from "../src/github.js";
import { createSecuritySarif, scanSecurityFindingsFromDisk } from "../src/security.js";
import { loadWorkspaceContext } from "../src/workspace.js";

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
    "  --config <path>           Read ShipProof configuration from a JSON file.",
    "  --browser-base-url <url>  Reuse an existing dev server instead of starting one.",
    "  --browser-ready-url <url> Server URL used for readiness polling.",
    "  --browser-timeout-ms <n>  Browser navigation and readiness timeout in milliseconds.",
    "  --browser-wait-until <v>  Playwright waitUntil value for route navigation.",
    "  --browser-log-dir <path>  Directory for dev server stdout/stderr logs.",
    "  --screenshot-dir <path>   Screenshot output directory. Default: shipproof-screenshots.",
    "  --json-report-path <path> Write the full JSON report payload to a file.",
    "  --security-sarif-path <path> Write SARIF security-lite results to a file.",
    "  --agent-prompt            Print only the agent feedback prompt when one is needed."
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
    console.log(formatCliOutput(result.report, args));
    console.error(`ShipProof report written to ${result.reportPath}; PR comment ${result.commentAction}.`);
    process.exitCode = result.report.status === "failed" ? 1 : 0;
  } else {
    const report = await runLocalMode(args);
    console.log(formatCliOutput(report, args));
    process.exitCode = report.status === "failed" ? 1 : 0;
  }
} catch (error) {
  console.error(`ShipProof failed: ${error.message}`);
  process.exitCode = 2;
}

function formatCliOutput(report, values) {
  if (values.includes("--agent-prompt")) {
    return report.agentFeedbackPrompt ?? "No agent feedback prompt needed.";
  }

  return report.markdown;
}

async function runLocalMode(values) {
  const packageJson = await readPackageJson(cwd);
  const config = await readConfig(values);
  const changedFiles = parseChangedFiles(values) ?? readChangedFilesFromGit(cwd);
  const workspaceContext = await loadWorkspaceContext({ cwd, packageJson, changedFiles, readFile });
  const browserPlan = createCliBrowserPlan({ packageJson, changedFiles, values, config, workspaceContext });

  let report = await runProof({
    packageJson,
    changedFiles,
    config,
    workspaceContext,
    executeCommand: (command) => executeCommand(command, cwd),
    securityScan: ({ securityConfig } = {}) => scanSecurityFindingsFromDisk({ changedFiles, cwd, config: securityConfig }),
    browserSmoke: browserPlan ? () => runBrowserSmoke({ plan: browserPlan }) : null
  });
  const jsonReportPath = readOption(values, "--json-report-path") || process.env.SHIPPROOF_JSON_REPORT_PATH;
  const securitySarifPath = readOption(values, "--security-sarif-path") || process.env.SHIPPROOF_SECURITY_SARIF_PATH;

  report = attachReportArtifacts(report, {
    json: jsonReportPath,
    sarif: securitySarifPath,
    screenshots: browserPlan?.screenshotDir,
    browserLogs: browserPlan?.logDir
  });

  if (jsonReportPath) {
    await writeJsonReportFile(jsonReportPath, report);
  }

  if (securitySarifPath) {
    await writeJsonReportFile(securitySarifPath, createSecuritySarif(report.securityFindings));
  }

  return report;
}

async function runGitHubMode(values) {
  const packageJson = await readPackageJson(cwd);
  const config = await readConfig(values);
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
    config,
    changedFiles: changedOverride,
    loadWorkspace: ({ changedFiles }) => loadWorkspaceContext({ cwd, packageJson, changedFiles, readFile }),
    executeCommand: (command) => executeCommand(command, cwd),
    securityScan: ({ changedFiles, securityConfig } = {}) =>
      scanSecurityFindingsFromDisk({ changedFiles: changedFiles ?? changedOverride ?? [], cwd, config: securityConfig }),
    request,
    writeReport: writeReportFile,
    writeJsonReport: writeJsonReportFile,
    writeSecuritySarif: writeJsonReportFile,
    appendSummary: process.env.GITHUB_STEP_SUMMARY
      ? (markdown) => appendFile(process.env.GITHUB_STEP_SUMMARY, markdown)
      : null
  });
}

async function readConfig(values) {
  const configPath = readOption(values, "--config") || process.env.INPUT_CONFIG_PATH || process.env.SHIPPROOF_CONFIG;

  return loadShipProofConfig({
    filePath: configPath ? path.resolve(cwd, configPath) : null,
    readFile
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

function createCliBrowserPlan({ packageJson, changedFiles, values, config, workspaceContext }) {
  const browserConfig = config.browser;

  if (values.includes("--no-browser") || process.env.SHIPPROOF_BROWSER_SMOKE === "false" || browserConfig.enabled === false) {
    return null;
  }

  const planConfig = {
    ...browserConfig,
    screenshotDir: readOption(values, "--screenshot-dir") || process.env.SHIPPROOF_SCREENSHOT_DIR || browserConfig.screenshotDir,
    logDir: readOption(values, "--browser-log-dir") || process.env.SHIPPROOF_BROWSER_LOG_DIR || browserConfig.logDir,
    readyUrl: readOption(values, "--browser-ready-url") || process.env.SHIPPROOF_BROWSER_READY_URL || browserConfig.readyUrl,
    timeoutMs: readNumberOption(values, "--browser-timeout-ms") ?? readNumber(process.env.SHIPPROOF_BROWSER_TIMEOUT_MS) ?? browserConfig.timeoutMs,
    waitUntil: readOption(values, "--browser-wait-until") || process.env.SHIPPROOF_BROWSER_WAIT_UNTIL || browserConfig.waitUntil
  };
  const baseUrl = readOption(values, "--browser-base-url") || process.env.SHIPPROOF_BROWSER_BASE_URL || browserConfig.baseUrl || undefined;
  const screenshotDir = readOption(values, "--screenshot-dir") || process.env.SHIPPROOF_SCREENSHOT_DIR || browserConfig.screenshotDir;

  for (const workspacePackage of workspaceContext?.changedPackages ?? []) {
    const workspacePlan = createBrowserSmokePlan({
      packageJson: workspacePackage.packageJson,
      changedFiles,
      baseUrl,
      screenshotDir,
      config: planConfig,
      packageRoot: workspacePackage.root,
      workspaceName: workspacePackage.name,
      packageManager: workspaceContext.packageManager
    });

    if (workspacePlan) {
      return workspacePlan;
    }
  }

  return createBrowserSmokePlan({
    packageJson,
    changedFiles,
    baseUrl,
    screenshotDir,
    config: planConfig,
    packageManager: workspaceContext?.packageManager
  });
}

function readNumberOption(values, name) {
  const value = readOption(values, name);

  return readNumber(value);
}

function readNumber(value) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

async function writeJsonReportFile(file, payload) {
  const directory = path.dirname(path.resolve(cwd, file));

  await mkdir(directory, { recursive: true });
  await writeFile(path.resolve(cwd, file), `${JSON.stringify(payload, null, 2)}\n`);
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
