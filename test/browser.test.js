import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, it } from "node:test";

import {
  checkRoutesWithPlaywright,
  createBrowserSmokePlan,
  detectFrontendFramework,
  inferSmokeRoutes,
  runBrowserSmoke,
  startDevServer
} from "../src/browser.js";

describe("detectFrontendFramework", () => {
  it("detects Next.js and builds a deterministic dev command", () => {
    const framework = detectFrontendFramework({
      scripts: { dev: "next dev" },
      dependencies: { next: "15.0.0" }
    });

    assert.deepEqual(framework, {
      name: "next",
      devCommand: "npm run dev -- --hostname 127.0.0.1 --port 4173",
      port: 4173
    });
  });

  it("detects Vite and builds a deterministic dev command", () => {
    const framework = detectFrontendFramework({
      scripts: { dev: "vite --host 0.0.0.0" },
      devDependencies: { vite: "6.0.0" }
    });

    assert.deepEqual(framework, {
      name: "vite",
      devCommand: "npm run dev -- --host 127.0.0.1 --port 4173",
      port: 4173
    });
  });

  it("uses the detected package manager for root dev commands", () => {
    const framework = detectFrontendFramework(
      {
        scripts: { dev: "vite" },
        devDependencies: { vite: "6.0.0" }
      },
      { packageManager: "pnpm" }
    );

    assert.deepEqual(framework, {
      name: "vite",
      devCommand: "pnpm dev -- --host 127.0.0.1 --port 4173",
      port: 4173
    });
  });
});

describe("inferSmokeRoutes", () => {
  it("infers Next.js app and pages routes from changed files", () => {
    const routes = inferSmokeRoutes({
      framework: "next",
      changedFiles: [
        "src/app/page.tsx",
        "src/app/login/page.tsx",
        "src/app/dashboard/[id]/page.tsx",
        "src/pages/settings.tsx",
        "src/components/Button.tsx"
      ]
    });

    assert.deepEqual(routes, ["/", "/login", "/dashboard/test", "/settings"]);
  });

  it("falls back to the home route for Vite frontend changes", () => {
    const routes = inferSmokeRoutes({
      framework: "vite",
      changedFiles: ["src/components/Button.tsx"]
    });

    assert.deepEqual(routes, ["/"]);
  });
});

describe("createBrowserSmokePlan", () => {
  it("returns a plan when a frontend framework and changed route are present", () => {
    const plan = createBrowserSmokePlan({
      packageJson: {
        scripts: { dev: "next dev" },
        dependencies: { next: "15.0.0" }
      },
      changedFiles: ["src/app/login/page.tsx"]
    });

    assert.deepEqual(plan, {
      framework: "next",
      devCommand: "npm run dev -- --hostname 127.0.0.1 --port 4173",
      baseUrl: "http://127.0.0.1:4173",
      routes: ["/login"],
      screenshotDir: "shipproof-screenshots",
      logDir: "shipproof-browser-logs",
      readyUrl: "http://127.0.0.1:4173",
      timeoutMs: 30000,
      waitUntil: "networkidle"
    });
  });

  it("merges configured routes, required mode, readiness, and logs into the plan", () => {
    const plan = createBrowserSmokePlan({
      packageJson: {
        scripts: { dev: "next dev" },
        dependencies: { next: "15.0.0" }
      },
      changedFiles: ["src/app/login/page.tsx"],
      config: {
        required: false,
        routes: ["/settings"],
        screenshotDir: "artifacts/screens",
        logDir: "artifacts/browser-logs",
        readyUrl: "http://127.0.0.1:4173/health",
        timeoutMs: 12000,
        waitUntil: "domcontentloaded"
      }
    });

    assert.deepEqual(plan, {
      framework: "next",
      devCommand: "npm run dev -- --hostname 127.0.0.1 --port 4173",
      baseUrl: "http://127.0.0.1:4173",
      routes: ["/login", "/settings"],
      screenshotDir: "artifacts/screens",
      logDir: "artifacts/browser-logs",
      readyUrl: "http://127.0.0.1:4173/health",
      timeoutMs: 12000,
      waitUntil: "domcontentloaded",
      required: false
    });
  });

  it("reuses an existing server when baseUrl is configured", () => {
    const plan = createBrowserSmokePlan({
      packageJson: {
        scripts: { dev: "next dev" },
        dependencies: { next: "15.0.0" }
      },
      changedFiles: ["app/login/page.tsx"],
      config: {
        baseUrl: "http://127.0.0.1:3000"
      }
    });

    assert.deepEqual(plan, {
      framework: "next",
      devCommand: null,
      baseUrl: "http://127.0.0.1:3000",
      routes: ["/login"],
      screenshotDir: "shipproof-screenshots",
      logDir: "shipproof-browser-logs",
      readyUrl: "http://127.0.0.1:3000",
      timeoutMs: 30000,
      waitUntil: "networkidle"
    });
  });

  it("builds package-local dev commands for workspace browser smoke", () => {
    const plan = createBrowserSmokePlan({
      packageJson: {
        scripts: { dev: "vite --host 0.0.0.0" },
        devDependencies: { vite: "6.0.0" }
      },
      changedFiles: ["apps/web/src/App.tsx"],
      packageRoot: "apps/web",
      workspaceName: "web",
      packageManager: "pnpm"
    });

    assert.deepEqual(plan, {
      framework: "vite",
      devCommand: "pnpm --filter web dev -- --host 127.0.0.1 --port 4173",
      baseUrl: "http://127.0.0.1:4173",
      routes: ["/"],
      screenshotDir: "shipproof-screenshots",
      logDir: "shipproof-browser-logs",
      readyUrl: "http://127.0.0.1:4173",
      timeoutMs: 30000,
      waitUntil: "networkidle",
      packageRoot: "apps/web",
      workspaceName: "web",
      packageManager: "pnpm"
    });
  });

  it("returns null when no frontend framework can be detected", () => {
    assert.equal(createBrowserSmokePlan({ packageJson: { scripts: { test: "node --test" } }, changedFiles: [] }), null);
  });
});

describe("runBrowserSmoke", () => {
  it("starts the server, checks routes, stops the server, and returns a passing proof check", async () => {
    const events = [];
    const check = await runBrowserSmoke({
      plan: {
        framework: "next",
        devCommand: "npm run dev -- --hostname 127.0.0.1 --port 4173",
        baseUrl: "http://127.0.0.1:4173",
        routes: ["/login", "/settings"],
        screenshotDir: "shipproof-screenshots"
      },
      startServer: async (plan) => {
        events.push(`start:${plan.devCommand}`);
        return { stop: async () => events.push("stop") };
      },
      checkRoutes: async (plan) => {
        events.push(`check:${plan.routes.join(",")}`);
        return [
          { route: "/login", status: "passed", screenshot: "shipproof-screenshots/login.png" },
          { route: "/settings", status: "passed", screenshot: "shipproof-screenshots/settings.png" }
        ];
      }
    });

    assert.deepEqual(events, [
      "start:npm run dev -- --hostname 127.0.0.1 --port 4173",
      "check:/login,/settings",
      "stop"
    ]);
    assert.equal(check.name, "browser-smoke");
    assert.equal(check.status, "passed");
    assert.equal(check.required, true);
    assert.deepEqual(check.browserRoutes, [
      { route: "/login", status: "passed", screenshot: "shipproof-screenshots/login.png" },
      { route: "/settings", status: "passed", screenshot: "shipproof-screenshots/settings.png" }
    ]);
    assert.match(check.summary, /2 routes passed/);
    assert.match(check.summary, /shipproof-screenshots/);
  });

  it("includes dev server log paths in the proof summary", async () => {
    const check = await runBrowserSmoke({
      plan: {
        framework: "next",
        devCommand: "npm run dev -- --hostname 127.0.0.1 --port 4173",
        baseUrl: "http://127.0.0.1:4173",
        routes: ["/"],
        screenshotDir: "shipproof-screenshots",
        logDir: "shipproof-browser-logs"
      },
      startServer: async () => ({
        logs: {
          stdout: "shipproof-browser-logs/server.stdout.log",
          stderr: "shipproof-browser-logs/server.stderr.log"
        },
        stop: async () => {}
      }),
      checkRoutes: async () => [{ route: "/", status: "passed", screenshot: "shipproof-screenshots/home.png" }]
    });

    assert.equal(check.status, "passed");
    assert.match(check.summary, /server logs: shipproof-browser-logs\/server\.stdout\.log, shipproof-browser-logs\/server\.stderr\.log/);
  });

  it("fails when a route reports console or network errors", async () => {
    const check = await runBrowserSmoke({
      plan: {
        framework: "vite",
        devCommand: "npm run dev -- --host 127.0.0.1 --port 4173",
        baseUrl: "http://127.0.0.1:4173",
        routes: ["/"],
        screenshotDir: "shipproof-screenshots"
      },
      startServer: async () => ({ stop: async () => {} }),
      checkRoutes: async () => [
        {
          route: "/",
          status: "failed",
          screenshot: "shipproof-screenshots/home.png",
          errors: ["console error: Hydration failed", "network 500: /api/user"]
        }
      ]
    });

    assert.equal(check.status, "failed");
    assert.deepEqual(check.browserRoutes, [
      {
        route: "/",
        status: "failed",
        screenshot: "shipproof-screenshots/home.png",
        errors: ["console error: Hydration failed", "network 500: /api/user"]
      }
    ]);
    assert.match(check.summary, /\/ failed: console error: Hydration failed/);
  });

  it("marks missing Playwright as not checked when browser smoke is advisory", async () => {
    const check = await runBrowserSmoke({
      plan: {
        framework: "vite",
        devCommand: null,
        baseUrl: "http://127.0.0.1:4173",
        routes: ["/"],
        screenshotDir: "shipproof-screenshots",
        required: false
      },
      checkRoutes: async () => {
        throw new Error("Playwright is not installed. Add playwright or @playwright/test to enable browser smoke checks.");
      }
    });

    assert.equal(check.status, "not_checked");
    assert.equal(check.required, false);
    assert.match(check.summary, /Playwright is not installed/);
  });
});

describe("startDevServer", () => {
  it("waits on the configured ready URL with timeout and records logs", async () => {
    const writes = [];
    let waitedUrl = null;
    let waitedOptions = null;
    const child = createFakeChild();

    const server = await startDevServer(
      {
        devCommand: "npm run dev",
        baseUrl: "http://127.0.0.1:4173",
        readyUrl: "http://127.0.0.1:4173/health",
        timeoutMs: 12000,
        logDir: "artifacts/browser-logs"
      },
      {
        cwd: "/repo",
        spawnImpl: () => child,
        mkdirImpl: async () => {},
        writeLog: async (file, chunk) => writes.push({ file, chunk: chunk.toString() }),
        waitForServerImpl: async (url, options) => {
          waitedUrl = url;
          waitedOptions = options;
        }
      }
    );

    child.stdout.emit("data", Buffer.from("ready\n"));
    child.stderr.emit("data", Buffer.from("warn\n"));
    await server.stop();

    assert.equal(waitedUrl, "http://127.0.0.1:4173/health");
    assert.deepEqual(waitedOptions, { timeoutMs: 12000 });
    assert.equal(server.logs.stdout, "artifacts/browser-logs/server.stdout.log");
    assert.equal(server.logs.stderr, "artifacts/browser-logs/server.stderr.log");
    assert.equal(child.killed, true);
    assert.deepEqual(writes, [
      { file: "/repo/artifacts/browser-logs/server.stdout.log", chunk: "ready\n" },
      { file: "/repo/artifacts/browser-logs/server.stderr.log", chunk: "warn\n" }
    ]);
  });

  it("fails with log paths when the dev server exits before readiness", async () => {
    const child = createFakeChild();
    const promise = startDevServer(
      {
        devCommand: "npm run dev",
        baseUrl: "http://127.0.0.1:4173",
        logDir: "shipproof-browser-logs"
      },
      {
        cwd: "/repo",
        spawnImpl: () => child,
        mkdirImpl: async () => {},
        writeLog: async () => {},
        waitForServerImpl: async () => new Promise(() => {})
      }
    );

    setImmediate(() => child.emit("close", 1));

    await assert.rejects(
      promise,
      /Dev server exited before ready at http:\/\/127\.0\.0\.1:4173 \(exit code 1\); logs: shipproof-browser-logs\/server\.stdout\.log, shipproof-browser-logs\/server\.stderr\.log/
    );
  });

  it("includes recent server stderr when readiness times out", async () => {
    const child = createFakeChild();
    const promise = startDevServer(
      {
        devCommand: "npm run dev",
        baseUrl: "http://127.0.0.1:4173",
        timeoutMs: 5,
        logDir: "shipproof-browser-logs"
      },
      {
        cwd: "/repo",
        spawnImpl: () => child,
        mkdirImpl: async () => {},
        writeLog: async () => {},
        waitForServerImpl: async () => new Promise((_, reject) => {
          setImmediate(() => {
            child.stderr.emit("data", Buffer.from("warming up\nfatal boot failure\n"));
            reject(new Error("timed out after 5ms"));
          });
        })
      }
    );

    await assert.rejects(
      promise,
      /Dev server did not become ready at http:\/\/127\.0\.0\.1:4173: timed out after 5ms; logs: shipproof-browser-logs\/server\.stdout\.log, shipproof-browser-logs\/server\.stderr\.log; last stderr: warming up \| fatal boot failure/
    );
  });
});

describe("checkRoutesWithPlaywright", () => {
  it("uses configured route waitUntil and timeout values", async () => {
    let gotoOptions = null;
    const page = {
      on: () => {},
      goto: async (_url, options) => {
        gotoOptions = options;
      },
      screenshot: async () => {},
      close: async () => {}
    };
    const browser = {
      newPage: async () => page,
      close: async () => {}
    };

    await checkRoutesWithPlaywright(
      {
        framework: "vite",
        baseUrl: "http://127.0.0.1:4173",
        routes: ["/"],
        screenshotDir: "shipproof-screenshots",
        waitUntil: "domcontentloaded",
        timeoutMs: 9000
      },
      {
        projectDir: process.cwd(),
        playwright: {
          chromium: {
            launch: async () => browser
          }
        }
      }
    );

    assert.deepEqual(gotoOptions, {
      waitUntil: "domcontentloaded",
      timeout: 9000
    });
  });

  it("loads Playwright from the owning workspace package", async () => {
    let loadedFrom = null;
    const page = {
      on: () => {},
      goto: async () => {},
      screenshot: async () => {},
      close: async () => {}
    };
    const browser = {
      newPage: async () => page,
      close: async () => {}
    };

    await checkRoutesWithPlaywright(
      {
        framework: "vite",
        baseUrl: "http://127.0.0.1:4173",
        routes: ["/"],
        screenshotDir: "shipproof-screenshots",
        packageRoot: "apps/web"
      },
      {
        projectDir: process.cwd(),
        loadPlaywrightImpl: async (projectDir) => {
          loadedFrom = projectDir;
          return {
            chromium: {
              launch: async () => browser
            }
          };
        }
      }
    );

    assert.equal(loadedFrom, `${process.cwd()}/apps/web`);
  });
});

function createFakeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.kill = () => {
    child.killed = true;
  };
  return child;
}
