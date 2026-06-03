import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { formatRootCommand, formatWorkspaceCommand } from "./workspace.js";

const DEFAULT_PORT = 4173;
const DEFAULT_SCREENSHOT_DIR = "shipproof-screenshots";
const DEFAULT_LOG_DIR = "shipproof-browser-logs";
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_WAIT_UNTIL = "networkidle";
const ROUTE_FILE_PATTERN = /\.(jsx|tsx|js|ts)$/;

export function detectFrontendFramework(packageJson, { port = DEFAULT_PORT, packageManager = "npm", workspaceName } = {}) {
  const scripts = packageJson?.scripts ?? {};
  const dependencies = {
    ...(packageJson?.dependencies ?? {}),
    ...(packageJson?.devDependencies ?? {})
  };
  const devScript = scripts.dev ?? "";

  if (dependencies.next || devScript.includes("next")) {
    return {
      name: "next",
      devCommand: `${formatDevCommand({ packageManager, workspaceName })} -- --hostname 127.0.0.1 --port ${port}`,
      port
    };
  }

  if (dependencies.vite || devScript.includes("vite")) {
    return {
      name: "vite",
      devCommand: `${formatDevCommand({ packageManager, workspaceName })} -- --host 127.0.0.1 --port ${port}`,
      port
    };
  }

  return null;
}

export function inferSmokeRoutes({ framework, changedFiles }) {
  const normalizedFiles = changedFiles.map(normalizePath);

  if (framework === "next") {
    const routes = unique(normalizedFiles.flatMap((file) => inferNextRoute(file)).filter(Boolean));
    return routes.length > 0 ? routes : fallbackRoutes(normalizedFiles);
  }

  if (framework === "vite") {
    return fallbackRoutes(normalizedFiles);
  }

  return [];
}

export function createBrowserSmokePlan({
  packageJson,
  changedFiles,
  baseUrl,
  port = DEFAULT_PORT,
  screenshotDir = DEFAULT_SCREENSHOT_DIR,
  config = {},
  packageRoot,
  workspaceName,
  packageManager = "npm"
}) {
  if (config.enabled === false) {
    return null;
  }

  const framework = detectFrontendFramework(packageJson, { port, packageManager, workspaceName });

  if (!framework) {
    return null;
  }

  const routes = unique([
    ...inferSmokeRoutes({ framework: framework.name, changedFiles }),
    ...(Array.isArray(config.routes) ? config.routes : [])
  ]);

  if (routes.length === 0) {
    return null;
  }

  const resolvedBaseUrl = baseUrl ?? config.baseUrl ?? `http://127.0.0.1:${framework.port}`;

  const plan = {
    framework: framework.name,
    devCommand: baseUrl || config.baseUrl ? null : framework.devCommand,
    baseUrl: resolvedBaseUrl,
    routes,
    screenshotDir: config.screenshotDir ?? screenshotDir,
    logDir: config.logDir ?? DEFAULT_LOG_DIR,
    readyUrl: config.readyUrl ?? resolvedBaseUrl,
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    waitUntil: config.waitUntil ?? DEFAULT_WAIT_UNTIL
  };

  if (packageRoot) {
    plan.packageRoot = packageRoot;
  }

  if (workspaceName) {
    plan.workspaceName = workspaceName;
    plan.packageManager = packageManager;
  }

  if (config.required !== undefined) {
    plan.required = config.required;
  }

  return plan;
}

export async function runBrowserSmoke({ plan, startServer = startDevServer, checkRoutes = checkRoutesWithPlaywright }) {
  const startedAt = performance.now();
  let server = null;

  try {
    if (plan.devCommand) {
      server = await startServer(plan);
    }

    const routeResults = await checkRoutes(plan);
    const failures = routeResults.filter((route) => route.status !== "passed");

    return {
      name: "browser-smoke",
      command: `playwright smoke (${plan.framework})`,
      status: failures.length > 0 ? "failed" : "passed",
      durationMs: Math.round(performance.now() - startedAt),
      summary: appendLogSummary(summarizeBrowserResults(routeResults, plan.screenshotDir), server?.logs),
      required: plan.required ?? true
    };
  } catch (error) {
    const required = plan.required ?? true;

    return {
      name: "browser-smoke",
      command: `playwright smoke (${plan.framework})`,
      status: !required && isMissingPlaywrightError(error) ? "not_checked" : "failed",
      durationMs: Math.round(performance.now() - startedAt),
      summary: error.message,
      required
    };
  } finally {
    if (server) {
      await server.stop();
    }
  }
}

export async function startDevServer(
  plan,
  {
    cwd = process.cwd(),
    spawnImpl = spawn,
    waitForServerImpl = waitForServer,
    mkdirImpl = mkdir,
    writeLog = appendFile
  } = {}
) {
  const logDir = plan.logDir ?? DEFAULT_LOG_DIR;
  const logs = {
    stdout: path.join(logDir, "server.stdout.log"),
    stderr: path.join(logDir, "server.stderr.log")
  };
  const stdoutFile = path.resolve(cwd, logs.stdout);
  const stderrFile = path.resolve(cwd, logs.stderr);

  await mkdirImpl(path.resolve(cwd, logDir), { recursive: true });

  const child = spawnImpl(plan.devCommand, {
    cwd,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => {
    writeLog(stdoutFile, chunk).catch(() => {});
  });
  child.stderr.on("data", (chunk) => {
    writeLog(stderrFile, chunk).catch(() => {});
  });

  const readyUrl = plan.readyUrl ?? plan.baseUrl;
  const readyResult = await Promise.race([
    waitForServerImpl(readyUrl, { timeoutMs: plan.timeoutMs ?? DEFAULT_TIMEOUT_MS }).then(
      () => ({ type: "ready" }),
      (error) => ({ type: "not-ready", error })
    ),
    new Promise((resolve) => {
      child.once("close", (code) => resolve({ type: "exited", code }));
    })
  ]);

  if (readyResult.type === "exited") {
    throw new Error(`Dev server exited before ready at ${readyUrl} (exit code ${readyResult.code ?? 1}); logs: ${logs.stdout}, ${logs.stderr}`);
  }

  if (readyResult.type === "not-ready") {
    child.kill("SIGTERM");
    throw new Error(`Dev server did not become ready at ${readyUrl}: ${readyResult.error.message}; logs: ${logs.stdout}, ${logs.stderr}`);
  }

  return {
    logs,
    stop: async () => {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    }
  };
}

export async function checkRoutesWithPlaywright(plan, { projectDir = process.cwd(), playwright, loadPlaywrightImpl = loadPlaywright } = {}) {
  const runtimeProjectDir = path.resolve(projectDir, plan.packageRoot ?? ".");
  const runtime = playwright ?? await loadPlaywrightImpl(runtimeProjectDir);
  const browser = await runtime.chromium.launch({ headless: true });
  const screenshotRoot = path.resolve(projectDir, plan.screenshotDir);

  await mkdir(screenshotRoot, { recursive: true });

  try {
    const results = [];

    for (const route of plan.routes) {
      results.push(await checkRoute({ browser, plan, route, screenshotRoot }));
    }

    return results;
  } finally {
    await browser.close();
  }
}

export function loadPlaywright(projectDir) {
  const requireFromProject = createRequire(path.join(projectDir, "package.json"));

  try {
    return requireFromProject("playwright");
  } catch {
    try {
      return requireFromProject("@playwright/test");
    } catch {
      throw new Error("Playwright is not installed. Add playwright or @playwright/test to enable browser smoke checks.");
    }
  }
}

function formatDevCommand({ packageManager, workspaceName }) {
  if (workspaceName) {
    return formatWorkspaceCommand({ packageManager, workspace: workspaceName, script: "dev" });
  }

  return formatRootCommand({ packageManager, script: "dev" });
}

async function checkRoute({ browser, plan, route, screenshotRoot }) {
  const page = await browser.newPage();
  const errors = [];
  const screenshot = path.join(screenshotRoot, routeToScreenshotName(route));

  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console error: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    errors.push(`page error: ${error.message}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      errors.push(`network ${response.status()}: ${response.url()}`);
    }
  });

  try {
    await page.goto(new URL(route, plan.baseUrl).toString(), {
      waitUntil: plan.waitUntil ?? DEFAULT_WAIT_UNTIL,
      timeout: plan.timeoutMs ?? DEFAULT_TIMEOUT_MS
    });
    await page.screenshot({ path: screenshot, fullPage: true });
  } catch (error) {
    errors.push(error.message);
  } finally {
    await page.close();
  }

  return {
    route,
    status: errors.length > 0 ? "failed" : "passed",
    screenshot: path.relative(process.cwd(), screenshot),
    errors
  };
}

async function waitForServer(url, { timeoutMs = 30000, intervalMs = 500 } = {}) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw new Error(`timed out after ${timeoutMs}ms`);
}

function appendLogSummary(summary, logs) {
  if (!logs) {
    return summary;
  }

  return `${summary}; server logs: ${logs.stdout}, ${logs.stderr}`;
}

function isMissingPlaywrightError(error) {
  return /Playwright is not installed/i.test(error?.message ?? "");
}

function inferNextRoute(file) {
  if (file.includes("/api/")) {
    return null;
  }

  const appIndex = file.indexOf("/app/");
  const appRelative = appIndex >= 0 ? file.slice(appIndex + "/app/".length) : file.startsWith("app/") ? file.slice(4) : null;

  if (appRelative && /^(.+\/)?page\.(jsx|tsx|js|ts)$/.test(appRelative)) {
    return pathToRoute(appRelative.replace(/\/?page\.(jsx|tsx|js|ts)$/, ""));
  }

  const pagesIndex = file.indexOf("/pages/");
  const pagesRelative = pagesIndex >= 0
    ? file.slice(pagesIndex + "/pages/".length)
    : file.startsWith("pages/")
    ? file.slice(6)
    : null;

  if (pagesRelative && ROUTE_FILE_PATTERN.test(pagesRelative) && !pagesRelative.startsWith("_")) {
    return pathToRoute(pagesRelative.replace(ROUTE_FILE_PATTERN, ""));
  }

  return null;
}

function pathToRoute(value) {
  const parts = value
    .split("/")
    .filter(Boolean)
    .filter((part) => !(part.startsWith("(") && part.endsWith(")")))
    .map((part) => {
      if (part === "index") {
        return "";
      }
      if (part.startsWith("[") && part.endsWith("]")) {
        return "test";
      }
      return part;
    })
    .filter(Boolean);

  return `/${parts.join("/")}`;
}

function fallbackRoutes(files) {
  return files.length === 0 || files.some(isFrontendFile) ? ["/"] : [];
}

function isFrontendFile(file) {
  return (
    file.includes("/app/") ||
    file.includes("/pages/") ||
    file.includes("/components/") ||
    [".tsx", ".jsx", ".css"].some((extension) => file.endsWith(extension))
  );
}

function summarizeBrowserResults(routeResults, screenshotDir) {
  const failures = routeResults.filter((route) => route.status !== "passed");

  if (failures.length === 0) {
    return `${routeResults.length} routes passed; screenshots: ${screenshotDir}`;
  }

  const firstFailure = failures[0];
  const detail = firstFailure.errors?.[0] ?? "unknown browser failure";

  return `${firstFailure.route} failed: ${detail}; screenshots: ${screenshotDir}`;
}

function routeToScreenshotName(route) {
  if (route === "/") {
    return "home.png";
  }

  return `${route.replace(/^\//, "").replace(/[^a-z0-9_-]+/gi, "-")}.png`;
}

function normalizePath(file) {
  return file.replaceAll("\\", "/");
}

function unique(values) {
  return [...new Set(values)];
}
