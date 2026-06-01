import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createBrowserSmokePlan,
  detectFrontendFramework,
  inferSmokeRoutes,
  runBrowserSmoke
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
      screenshotDir: "shipproof-screenshots"
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
    assert.match(check.summary, /2 routes passed/);
    assert.match(check.summary, /shipproof-screenshots/);
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
    assert.match(check.summary, /\/ failed: console error: Hydration failed/);
  });
});
