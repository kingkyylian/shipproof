export const DEFAULT_SHIPPROOF_CONFIG = {
  checks: {
    lint: "optional",
    typecheck: "optional",
    test: "required",
    build: "required"
  },
  browser: {
    enabled: true,
    required: true,
    baseUrl: null,
    routes: [],
    screenshotDir: "shipproof-screenshots",
    logDir: "shipproof-browser-logs",
    readyUrl: null,
    timeoutMs: 30000,
    waitUntil: "networkidle"
  },
  security: {
    enabled: true,
    allow: [],
    baseline: [],
    severity: {}
  },
  workspace: {
    enabled: true,
    includeRoot: false
  },
  score: {
    ship: 80,
    review: 60
  },
  reports: {
    markdown: "shipproof-report.md",
    json: "shipproof-report.json",
    sarif: "shipproof-security.sarif"
  }
};

export function resolveShipProofConfig(config = {}) {
  return {
    checks: {
      ...DEFAULT_SHIPPROOF_CONFIG.checks,
      ...(config.checks ?? {})
    },
    browser: {
      ...DEFAULT_SHIPPROOF_CONFIG.browser,
      ...(config.browser ?? {}),
      routes: Array.isArray(config.browser?.routes)
        ? config.browser.routes
        : DEFAULT_SHIPPROOF_CONFIG.browser.routes
    },
    security: {
      ...DEFAULT_SHIPPROOF_CONFIG.security,
      ...(config.security ?? {}),
      allow: Array.isArray(config.security?.allow)
        ? config.security.allow
        : DEFAULT_SHIPPROOF_CONFIG.security.allow,
      baseline: Array.isArray(config.security?.baseline)
        ? config.security.baseline
        : DEFAULT_SHIPPROOF_CONFIG.security.baseline,
      severity: isPlainObject(config.security?.severity)
        ? config.security.severity
        : DEFAULT_SHIPPROOF_CONFIG.security.severity
    },
    workspace: {
      ...DEFAULT_SHIPPROOF_CONFIG.workspace,
      ...(config.workspace ?? {})
    },
    score: {
      ...DEFAULT_SHIPPROOF_CONFIG.score,
      ...(config.score ?? {})
    },
    reports: {
      ...DEFAULT_SHIPPROOF_CONFIG.reports,
      ...(config.reports ?? {})
    }
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function loadShipProofConfig({ filePath, readFile } = {}) {
  if (!filePath) {
    return resolveShipProofConfig();
  }

  const content = await readFile(filePath, "utf8");
  return resolveShipProofConfig(JSON.parse(content));
}
