import { buildSecurityCheck, calculateShipScore } from "./security.js";
import { createAgentFeedbackPrompt } from "./agent-feedback.js";
import { resolveShipProofConfig } from "./config.js";
import { formatRootCommand, formatWorkspaceCommand } from "./workspace.js";

const COMMAND_ORDER = [
  { script: "lint", command: "npm run lint", required: false },
  { script: "typecheck", command: "npm run typecheck", required: false },
  { script: "test", command: "npm test", required: true },
  { script: "build", command: "npm run build", required: true }
];

const RISK_RULES = [
  {
    category: "auth",
    severity: "high",
    matches: (file) =>
      includesAny(file, ["auth", "login", "signup", "session", "middleware", "permission", "role"])
  },
  {
    category: "database",
    severity: "high",
    matches: (file) =>
      includesAny(file, ["migration", "supabase", "prisma", "schema.sql", "schema.prisma"]) ||
      file.endsWith(".sql")
  },
  {
    category: "payment",
    severity: "high",
    matches: (file) => includesAny(file, ["stripe", "payment", "billing", "checkout", "webhook"])
  },
  {
    category: "backend",
    severity: "medium",
    matches: (file) =>
      includesAny(file, ["/api/", "route.ts", "route.js", "server", "controller", "handler"])
  },
  {
    category: "config",
    severity: "medium",
    matches: (file) =>
      file.startsWith(".env") ||
      includesAny(file, ["config", "next.config", "vite.config", "tsconfig", "dockerfile"])
  },
  {
    category: "dependency",
    severity: "medium",
    matches: (file) =>
      ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb"].includes(file)
  },
  {
    category: "frontend",
    severity: "low",
    matches: (file) =>
      includesAny(file, ["page.tsx", "page.jsx", "component", "/app/", "/pages/", "/components/"]) ||
      [".tsx", ".jsx", ".css"].some((extension) => file.endsWith(extension))
  }
];

export function discoverProjectCommands(packageJson, config, workspaceContext = {}) {
  const scripts = packageJson?.scripts ?? {};
  const resolvedConfig = resolveShipProofConfig(config);
  const resolvedWorkspaceContext = workspaceContext ?? {};
  const workspacePackages = resolvedConfig.workspace.enabled === false
    ? []
    : resolvedWorkspaceContext.workspacePackages ?? resolvedWorkspaceContext.changedPackages ?? [];
  const packageManager = resolvedWorkspaceContext.packageManager ?? "npm";

  if (workspacePackages.length > 0) {
    return [
      ...(resolvedConfig.workspace.includeRoot ? discoverRootCommands(scripts, resolvedConfig, packageManager) : []),
      ...workspacePackages.flatMap((workspacePackage) =>
        discoverWorkspacePackageCommands({ workspacePackage, packageManager, config: resolvedConfig })
      )
    ];
  }

  return discoverRootCommands(scripts, resolvedConfig, packageManager);
}

function discoverRootCommands(scripts, resolvedConfig, packageManager = "npm") {
  return COMMAND_ORDER
    .filter(({ script }) => typeof scripts[script] === "string")
    .map(({ script, required }) => ({
      name: script,
      command: formatRootCommand({ packageManager, script }),
      required: isRequiredCheck(resolvedConfig.checks[script], required)
    }))
    .filter(Boolean);
}

function discoverWorkspacePackageCommands({ workspacePackage, packageManager, config }) {
  const scripts = workspacePackage.packageJson?.scripts ?? {};
  const workspace = workspacePackage.name ?? workspacePackage.root;

  return COMMAND_ORDER
    .filter(({ script }) => typeof scripts[script] === "string")
    .map(({ script, required }) => ({
      name: `${workspace}:${script}`,
      command: formatWorkspaceCommand({ packageManager, workspace, script }),
      required: isRequiredCheck(config.checks[script], required)
    }));
}

export function classifyChangedFiles(files) {
  return RISK_RULES
    .map(({ category, severity, matches }) => ({
      category,
      severity,
      files: unique(files.filter((file) => matches(normalizePath(file))))
    }))
    .filter((risk) => risk.files.length > 0);
}

export function createProofReport({
  packageJson,
  changedFiles,
  checkResults,
  requiredCheckNames = [],
  securityFindings = [],
  artifacts,
  config,
  generatedAt = new Date().toISOString()
}) {
  const resolvedConfig = resolveShipProofConfig(config);
  const plannedChecks = discoverProjectCommands(packageJson, resolvedConfig);
  const requiredByName = new Map(plannedChecks.map((check) => [check.name, check.required]));
  for (const checkName of requiredCheckNames) {
    requiredByName.set(checkName, true);
  }
  const risks = classifyChangedFiles(changedFiles);
  const status = deriveStatus(checkResults, requiredByName);
  const { decision, score } = calculateShipScore({
    status,
    checks: checkResults.map((check) => ({
      ...check,
      required: check.required ?? requiredByName.get(check.name)
    })),
    risks,
    securityFindings,
    thresholds: resolvedConfig.score
  });
  const suggestedNextTests = suggestNextTests(risks);
  const rerunCommands = suggestRerunCommands({ checks: checkResults, changedFiles, status, decision });
  const activeSecurityFindings = securityFindings.filter((finding) => finding.status !== "baseline");
  const agentFeedbackPrompt = createAgentFeedbackPrompt({
    decision,
    status,
    score,
    checks: checkResults,
    risks,
    securityFindings: activeSecurityFindings,
    suggestedNextTests,
    changedFiles
  });
  const payload = {
    schemaVersion: "1.0",
    status,
    decision,
    score,
    generatedAt,
    checks: checkResults,
    risks,
    securityFindings,
    suggestedNextTests,
    rerunCommands,
    artifacts: normalizeArtifacts(artifacts),
    agentFeedbackPrompt
  };

  return {
    ...payload,
    markdown: renderProofReport(payload)
  };
}

export function attachReportArtifacts(report, artifacts) {
  const payload = {
    ...report,
    artifacts: normalizeArtifacts(artifacts)
  };

  return {
    ...payload,
    markdown: renderProofReport(payload)
  };
}

export async function runProof({ packageJson, changedFiles, generatedAt, config, executeCommand, securityScan, browserSmoke, workspaceContext }) {
  const resolvedConfig = resolveShipProofConfig(config);
  const checks = discoverProjectCommands(packageJson, resolvedConfig, workspaceContext);
  const checkResults = [];
  let securityFindings = [];
  const requiredCheckNames = checks.filter((check) => check.required).map((check) => check.name);
  let failedRequiredCheck = null;

  for (const check of checks) {
    if (failedRequiredCheck) {
      checkResults.push({
        name: check.name,
        command: check.command,
        status: "not_checked",
        summary: `Skipped after ${failedRequiredCheck} failure`
      });
      continue;
    }

    const result = await executeCommand(check.command);
    const status = result.exitCode === 0 ? "passed" : "failed";

    const checkResult = {
      name: check.name,
      command: check.command,
      status,
      durationMs: result.durationMs,
      summary: summarizeCommandOutput(result)
    };

    if (status === "failed") {
      const failureExcerpt = summarizeCommandExcerpt(result);

      if (failureExcerpt) {
        checkResult.failureExcerpt = failureExcerpt;
      }
    }

    checkResults.push(checkResult);

    if (check.required && status === "failed") {
      failedRequiredCheck = check.name;
    }
  }

  if (resolvedConfig.security.enabled !== false && securityScan) {
    securityFindings = await securityScan({ securityConfig: resolvedConfig.security });
    const securityCheck = buildSecurityCheck(securityFindings);
    checkResults.push(securityCheck);

    if (securityCheck.required) {
      requiredCheckNames.push(securityCheck.name);
    }

    if (securityCheck.required && securityCheck.status === "failed") {
      failedRequiredCheck = securityCheck.name;
    }
  }

  if (!failedRequiredCheck && browserSmoke) {
    const browserCheck = await browserSmoke();
    checkResults.push(browserCheck);

    if (browserCheck.required) {
      requiredCheckNames.push(browserCheck.name);
    }
  }

  return createProofReport({
    packageJson,
    changedFiles,
    checkResults,
    requiredCheckNames,
    securityFindings,
    config: resolvedConfig,
    generatedAt
  });
}

function isRequiredCheck(value, fallback) {
  if (value === "required" || value === true) {
    return true;
  }

  if (value === "optional" || value === false) {
    return false;
  }

  return fallback;
}

export function renderProofReport({
  status,
  decision,
  score,
  generatedAt,
  checks,
  risks,
  securityFindings = [],
  suggestedNextTests,
  rerunCommands = [],
  artifacts,
  agentFeedbackPrompt
}) {
  const lines = [
    "# ShipProof Report",
    "",
    `**Status:** ${status}`
  ];

  if (decision && typeof score === "number") {
    lines.push(`**Decision:** ${decision}`, `**Score:** ${score}/100`);
  }

  lines.push(
    "",
    "## Merge Signal",
    "",
    "| Status | Decision | Score | Failed Checks | Security Findings | Artifacts |",
    "| --- | --- | --- | ---: | ---: | --- |",
    `| ${formatStatus(status)} | ${decision ?? "n/a"} | ${formatScore(score)} | ${countChecksByStatus(checks, "failed")} | ${securityFindings.length} | ${formatArtifactSummary(artifacts)} |`,
    ""
  );

  lines.push(
    `**Generated:** ${generatedAt}`,
    "",
    "## Checks",
    "",
    "| Check | Command | Status | Duration | Summary |",
    "| --- | --- | --- | --- | --- |"
  );

  for (const check of checks) {
    lines.push(
      `| ${check.name} | \`${check.command}\` | ${formatStatus(check.status)} | ${formatDuration(check.durationMs)} | ${escapeTableCell(check.summary ?? "")} |`
    );
  }

  const detailedChecks = checks.filter((check) => check.failureExcerpt);

  if (detailedChecks.length > 0) {
    lines.push("", "## Check Details", "");

    for (const check of detailedChecks) {
      lines.push(
        `### ${check.name}`,
        "",
        `- Command: \`${check.command}\``,
        `- Status: ${formatStatus(check.status)}`,
        "",
        "```text",
        check.failureExcerpt,
        "```",
        ""
      );
    }
  }

  lines.push("", "## Risky Changes", "", "| Risk | Severity | Files |", "| --- | --- | --- |");

  if (risks.length === 0) {
    lines.push("| none | none | none |");
  } else {
    for (const risk of risks) {
      lines.push(
        `| ${risk.category} | ${risk.severity} | ${risk.files.map((file) => `\`${file}\``).join(", ")} |`
      );
    }
  }

  if (securityFindings.length > 0) {
    lines.push("", "## Security Findings", "", "| Finding | Severity | Status | Location | Message | Snippet |", "| --- | --- | --- | --- | --- | --- |");

    for (const finding of securityFindings) {
      lines.push(
        `| ${finding.id} | ${finding.severity} | ${escapeTableCell(formatSecurityStatus(finding))} | \`${formatSecurityLocation(finding)}\` | ${escapeTableCell(finding.message)} | ${escapeTableCell(finding.snippet ?? "")} |`
      );
    }
  }

  lines.push("", "## Suggested Next Tests", "");

  if (suggestedNextTests.length === 0) {
    lines.push("- No additional checks suggested.");
  } else {
    for (const test of suggestedNextTests) {
      lines.push(`- ${test}`);
    }
  }

  if (rerunCommands.length > 0) {
    lines.push("", "## Rerun Commands", "");

    for (const command of rerunCommands) {
      lines.push(`- \`${command}\``);
    }
  }

  const artifactLines = formatArtifacts(artifacts);

  if (artifactLines.length > 0) {
    lines.push("", "## Artifacts", "", ...artifactLines);
  }

  if (agentFeedbackPrompt) {
    lines.push("", "## Agent Feedback Prompt", "", "```text", agentFeedbackPrompt, "```");
  }

  lines.push("");
  return lines.join("\n");
}

function includesAny(value, needles) {
  return needles.some((needle) => value.includes(needle));
}

function normalizePath(file) {
  return file.replaceAll("\\", "/").toLowerCase();
}

function unique(values) {
  return [...new Set(values)];
}

function formatStatus(status) {
  return status.replaceAll("_", " ");
}

function formatDuration(durationMs) {
  if (typeof durationMs !== "number") {
    return "n/a";
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
}

function formatScore(score) {
  return typeof score === "number" ? `${score}/100` : "n/a";
}

function countChecksByStatus(checks, status) {
  return checks.filter((check) => check.status === status).length;
}

function formatArtifactSummary(artifacts) {
  const artifactLines = formatArtifacts(artifacts);

  if (artifactLines.length === 0) {
    return "none";
  }

  return artifactLines
    .map((line) => line.replace(/^- /, "").replace(/: `.*`$/, ""))
    .join(", ");
}

function formatSecurityLocation(finding) {
  if (!finding.line) {
    return finding.file;
  }

  return `${finding.file}:${finding.line}`;
}

function formatSecurityStatus(finding) {
  if (finding.status === "baseline") {
    return `baseline${finding.baselineReason ? `: ${finding.baselineReason}` : ""}`;
  }

  return "active";
}

function escapeTableCell(value) {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function summarizeCommandOutput({ stdout = "", stderr = "" }) {
  const output = stderr.trim() || stdout.trim();

  if (output.length === 0) {
    return "";
  }

  return redactCommandOutputLine(output.split("\n")[0].trim());
}

function summarizeCommandExcerpt({ stdout = "", stderr = "" }) {
  const output = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n").trim();

  if (output.length === 0) {
    return "";
  }

  const lines = output
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .map(redactCommandOutputLine)
    .slice(-12);
  const excerpt = lines.join("\n");
  const maxLength = 1200;

  if (excerpt.length <= maxLength) {
    return excerpt;
  }

  return `${excerpt.slice(0, maxLength).trimEnd()}\n...`;
}

function redactCommandOutputLine(line) {
  return line
    .replace(
      /\b([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY|DATABASE_URL)[A-Z0-9_]*)\s*=\s*("[^"]*"|'[^']*'|\S+)/gi,
      "$1=[redacted]"
    )
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]{12,}/gi, "$1 [redacted]");
}

function deriveStatus(checkResults, requiredByName) {
  if (checkResults.length === 0) {
    return "not_checked";
  }

  const hasFailedCheck = checkResults.some((check) => check.status === "failed");

  if (hasFailedCheck) {
    return "failed";
  }

  const requiredChecks = checkResults.filter((check) => check.required === true || requiredByName.get(check.name) === true);
  const requiredScope = requiredChecks.length > 0 ? requiredChecks : checkResults;
  const hasUncheckedRequiredCheck = requiredScope.some((check) => check.status === "not_checked");

  return hasUncheckedRequiredCheck ? "not_checked" : "passed";
}

function suggestNextTests(risks) {
  const suggestionsByCategory = {
    auth: "Add authenticated and unauthenticated smoke coverage for changed auth paths.",
    database: "Run migrations against a disposable database and verify rollback or reset behavior.",
    payment: "Replay payment webhook success, duplicate, and invalid-signature cases.",
    backend: "Exercise changed API routes with success, unauthorized, and invalid-input requests.",
    config: "Verify required environment variables and production build configuration.",
    dependency: "Run dependency audit and lockfile integrity checks.",
    frontend: "Open changed UI routes in a browser and capture console or network errors."
  };

  return risks
    .map((risk) => suggestionsByCategory[risk.category])
    .filter(Boolean)
    .filter((suggestion, index, suggestions) => suggestions.indexOf(suggestion) === index);
}

function suggestRerunCommands({ checks, changedFiles, status, decision }) {
  if (status === "passed" && decision === "ship") {
    return [];
  }

  const commands = checks
    .filter((check) => ["failed", "not_checked"].includes(check.status) && check.command)
    .map((check) => check.command);

  if (changedFiles.length > 0) {
    commands.push(`npm run shipproof -- --changed ${changedFiles.join(",")}`);
  }

  return unique(commands);
}

function normalizeArtifacts(artifacts) {
  if (!artifacts) {
    return undefined;
  }

  const normalized = Object.fromEntries(
    Object.entries(artifacts).filter(([, value]) => typeof value === "string" && value.length > 0)
  );

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function formatArtifacts(artifacts) {
  const labels = [
    ["markdown", "Markdown report"],
    ["json", "JSON report"],
    ["sarif", "Security SARIF"],
    ["screenshots", "Screenshots"],
    ["browserLogs", "Browser logs"]
  ];

  return labels
    .filter(([key]) => artifacts?.[key])
    .map(([key, label]) => `- ${label}: \`${artifacts[key]}\``);
}
