import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PORT = 4173;
const DEFAULT_SCREENSHOT_DIR = "shipproof-screenshots";
const ROUTE_FILE_PATTERN = /\.(jsx|tsx|js|ts)$/;

export function detectFrontendFramework(packageJson, { port = DEFAULT_PORT } = {}) {
  const scripts = packageJson?.scripts ?? {};
  const dependencies = {
    ...(packageJson?.dependencies ?? {}),
    ...(packageJson?.devDependencies ?? {})
  };
  const devScript = scripts.dev ?? "";

  if (dependencies.next || devScript.includes("next")) {
    return {
      name: "next",
      devCommand: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
      port
    };
  }

  if (dependencies.vite || devScript.includes("vite")) {
    return {
      name: "vite",
      devCommand: `npm run dev -- --host 127.0.0.1 --port ${port}`,
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
  config = {}
}) {
  if (config.enabled === false) {
    return null;
  }

  const framework = detectFrontendFramework(packageJson, { port });

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

  const plan = {
    framework: framework.name,
    devCommand: baseUrl ? null : framework.devCommand,
    baseUrl: baseUrl ?? config.baseUrl ?? `http://127.0.0.1:${framework.port}`,
    routes,
    screenshotDir: config.screenshotDir ?? screenshotDir
  };

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
      summary: summarizeBrowserResults(routeResults, plan.screenshotDir),
      required: plan.required ?? true
    };
  } catch (error) {
    return {
      name: "browser-smoke",
      command: `playwright smoke (${plan.framework})`,
      status: "failed",
      durationMs: Math.round(performance.now() - startedAt),
      summary: error.message,
      required: plan.required ?? true
    };
  } finally {
    if (server) {
      await server.stop();
    }
  }
}

export async function startDevServer(plan, { cwd = process.cwd(), spawnImpl = spawn, waitForServerImpl = waitForServer } = {}) {
  const child = spawnImpl(plan.devCommand, {
    cwd,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForServerImpl(plan.baseUrl);
  } catch (error) {
    child.kill("SIGTERM");
    throw new Error(`Dev server did not become ready at ${plan.baseUrl}: ${error.message || stderr.trim()}`);
  }

  return {
    stop: async () => {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    }
  };
}

export async function checkRoutesWithPlaywright(plan, { projectDir = process.cwd(), playwright } = {}) {
  const runtime = playwright ?? loadPlaywright(projectDir);
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
      waitUntil: "networkidle",
      timeout: 15000
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
