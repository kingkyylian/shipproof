import { readFile } from "node:fs/promises";
import path from "node:path";

const SECRET_ASSIGNMENT = /^\s*([A-Z0-9_]*(?:SECRET|TOKEN|API_KEY|PASSWORD|PRIVATE_KEY|ACCESS_KEY)[A-Z0-9_]*)\s*=\s*["']?([^"'\s#;]+)/gim;
const PLACEHOLDER_VALUE = /^(your_.*|changeme|change_me|example|dummy|test|todo|xxx|<.+>)$/i;
const PUBLIC_SECRET = /\b(NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|TOKEN|PRIVATE_KEY|ACCESS_KEY)\b)\s*=/gi;
const UNSAFE_CORS_PATTERNS = [
  /access-control-allow-origin['"]?\s*[:=]\s*['"]\*/i,
  /origin\s*:\s*['"]\*['"]/i
];
const PUBLIC_STORAGE_BUCKET = /\binsert\s+into\s+storage\.buckets\b[^\n]*\bpublic\b[^\n]*\btrue\b/i;
const RLS_DISABLED = /\balter\s+table\s+[\w".]+\.[\w"]+\s+disable\s+row\s+level\s+security\b/i;
const BROAD_ANON_WRITE = /\bcreate\s+policy\b[^\n]*\bfor\s+(?:insert|update|delete|all)\b[^\n]*\bto\s+anon\b[^\n]*(?:using|with\s+check)\s*\(\s*true\s*\)/i;
const ALLOWLIST_HINT = "Add security.allow with id, file, line, reason, and expiresAt if this is intentional.";
const SARIF_LEVEL_BY_SEVERITY = {
  high: "error",
  medium: "warning",
  low: "note"
};
const VALID_SEVERITIES = new Set(["high", "medium", "low"]);

export function scanSecurityFindings(files, config = {}) {
  const findings = [];
  const allow = Array.isArray(config.allow) ? config.allow : [];
  const baseline = Array.isArray(config.baseline) ? config.baseline : [];
  const severityOverrides = isPlainObject(config.severity) ? config.severity : {};
  const now = toDate(config.now) ?? new Date();

  for (const file of files) {
    const normalizedPath = normalizePath(file.path);
    const content = file.content ?? "";

    if (isCommittedEnvFile(normalizedPath)) {
      findings.push(withAllowlistHint({
        id: "committed-env-file",
        severity: "high",
        file: file.path,
        line: 1,
        column: 1,
        message: "Runtime environment files should not be committed."
      }));
    }

    findings.push(...findSecretFindings(file.path, content));

    findings.push(...findUnsafeCorsFindings(file.path, content));
    findings.push(...findPublicSecretFindings(file.path, content));
    findings.push(...findSupabaseSqlFindings(file.path, content));

    if (isAuthSensitivePath(normalizedPath)) {
      findings.push(withAllowlistHint({
        id: "auth-sensitive-change",
        severity: "medium",
        file: file.path,
        line: content ? 1 : undefined,
        column: content ? 1 : undefined,
        message: "Authentication-sensitive files changed and need explicit auth coverage."
      }));
    }
  }

  return findings
    .filter((finding) => !isAllowlisted(finding, allow, now))
    .map((finding) => applySeverityOverride(finding, severityOverrides))
    .map((finding) => withBaselineStatus(finding, baseline, now));
}

export async function scanSecurityFindingsFromDisk({ changedFiles, cwd = process.cwd(), config } = {}) {
  const files = [];

  for (const changedFile of changedFiles) {
    try {
      const content = await readFile(path.resolve(cwd, changedFile), "utf8");
      files.push({ path: changedFile, content });
    } catch {
      files.push({ path: changedFile, content: "" });
    }
  }

  return scanSecurityFindings(files, config);
}

export function buildSecurityCheck(findings) {
  const activeFindings = findings.filter(isActiveFinding);
  const baselineCount = findings.length - activeFindings.length;
  const highCount = activeFindings.filter((finding) => finding.severity === "high").length;
  const mediumCount = activeFindings.filter((finding) => finding.severity === "medium").length;

  if (highCount > 0) {
    return {
      name: "security-lite",
      command: "shipproof security-lite",
      status: "failed",
      summary: `${highCount} high security ${highCount === 1 ? "finding" : "findings"}`,
      required: true
    };
  }

  if (mediumCount > 0) {
    return {
      name: "security-lite",
      command: "shipproof security-lite",
      status: "passed",
      summary: `${mediumCount} medium security ${mediumCount === 1 ? "finding" : "findings"}`,
      required: true
    };
  }

  if (baselineCount > 0) {
    return {
      name: "security-lite",
      command: "shipproof security-lite",
      status: "passed",
      summary: `No active security-lite findings; ${baselineCount} baseline ${baselineCount === 1 ? "finding" : "findings"}`,
      required: true
    };
  }

  return {
    name: "security-lite",
    command: "shipproof security-lite",
    status: "passed",
    summary: "No security-lite findings",
    required: true
  };
}

export function calculateShipScore({ status, checks, risks, securityFindings, thresholds = { ship: 80, review: 60 } }) {
  const failedRequiredChecks = checks.filter((check) => check.required === true && check.status === "failed").length;
  const failedOptionalChecks = checks.filter((check) => check.required !== true && check.status === "failed").length;
  const uncheckedRequiredChecks = checks.filter((check) => check.required === true && check.status === "not_checked").length;
  const highRisks = risks.filter((risk) => risk.severity === "high").length;
  const mediumRisks = risks.filter((risk) => risk.severity === "medium").length;
  const activeSecurityFindings = securityFindings.filter(isActiveFinding);
  const highSecurity = activeSecurityFindings.filter((finding) => finding.severity === "high").length;
  const mediumSecurity = activeSecurityFindings.filter((finding) => finding.severity === "medium").length;
  const score = Math.max(
    0,
    100 -
      failedRequiredChecks * 30 -
      failedOptionalChecks * 15 -
      uncheckedRequiredChecks * 20 -
      highRisks * 15 -
      mediumRisks * 6 -
      highSecurity * 35 -
      mediumSecurity * 8
  );

  return {
    score,
    decision: decide({ score, status, highSecurity, thresholds })
  };
}

export function createSecuritySarif(findings = []) {
  const activeFindings = findings.filter(isActiveFinding);
  const rulesById = new Map();

  for (const finding of activeFindings) {
    if (!rulesById.has(finding.id)) {
      rulesById.set(finding.id, {
        id: finding.id,
        name: finding.id,
        shortDescription: { text: finding.message },
        defaultConfiguration: { level: toSarifLevel(finding.severity) }
      });
    }
  }

  return {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "ShipProof security-lite",
            informationUri: "https://github.com/kingkyylian/shipproof",
            rules: [...rulesById.values()]
          }
        },
        results: activeFindings.map((finding) => ({
          ruleId: finding.id,
          level: toSarifLevel(finding.severity),
          message: { text: finding.message },
          locations: [toSarifLocation(finding)]
        }))
      }
    ]
  };
}

function findSecretFindings(file, content) {
  const findings = [];
  const matches = content.matchAll(SECRET_ASSIGNMENT);

  for (const match of matches) {
    const name = match[1];
    const value = match[2];

    if (name.startsWith("NEXT_PUBLIC_") || PLACEHOLDER_VALUE.test(value)) {
      continue;
    }

    const location = locationForIndex(content, match.index ?? 0);
    findings.push(withAllowlistHint({
      id: "possible-secret",
      severity: "high",
      file,
      line: location.line,
      column: location.column,
      snippet: redactSecretSnippet(location.text, name),
      message: `${name} looks like a committed secret.`
    }));
  }

  return findings;
}

function findUnsafeCorsFindings(file, content) {
  const findings = [];

  for (const pattern of UNSAFE_CORS_PATTERNS) {
    const match = pattern.exec(content);

    if (!match) {
      continue;
    }

    const location = locationForIndex(content, match.index ?? 0);
    findings.push(withAllowlistHint({
      id: "unsafe-cors",
      severity: "high",
      file,
      line: location.line,
      column: location.column,
      snippet: location.text.trim(),
      message: "Wildcard CORS allows any origin."
    }));
    break;
  }

  return findings;
}

function findPublicSecretFindings(file, content) {
  const findings = [];
  const matches = content.matchAll(PUBLIC_SECRET);

  for (const match of matches) {
    const name = match[1];
    const location = locationForIndex(content, match.index ?? 0);

    findings.push(withAllowlistHint({
      id: "public-secret",
      severity: "high",
      file,
      line: location.line,
      column: location.column,
      snippet: redactSecretSnippet(location.text, name),
      message: "Public client environment variables should not contain secrets or tokens."
    }));
  }

  return findings;
}

function findSupabaseSqlFindings(file, content) {
  const rules = [
    {
      id: "public-storage-policy",
      pattern: PUBLIC_STORAGE_BUCKET,
      message: "Supabase storage bucket is configured as public."
    },
    {
      id: "rls-disabled",
      pattern: RLS_DISABLED,
      message: "Row level security is disabled on a database table."
    },
    {
      id: "broad-anon-write",
      pattern: BROAD_ANON_WRITE,
      message: "Anon role has a broad write policy."
    }
  ];
  const findings = [];

  for (const rule of rules) {
    const match = rule.pattern.exec(content);

    if (!match) {
      continue;
    }

    const location = locationForIndex(content, match.index ?? 0);
    findings.push(withAllowlistHint({
      id: rule.id,
      severity: "high",
      file,
      line: location.line,
      column: location.column,
      snippet: location.text.trim(),
      message: rule.message
    }));
  }

  return findings;
}

function isCommittedEnvFile(file) {
  const name = path.posix.basename(file);
  return name.startsWith(".env") && !name.includes("example") && !name.includes("sample") && !name.includes("template");
}

function isAuthSensitivePath(file) {
  return file === "middleware.ts" || file === "middleware.js" || /(^|\/)(auth|login|session|permission|role)(\/|\.|-)/i.test(file);
}

function decide({ score, status, highSecurity, thresholds }) {
  if (status === "failed" || highSecurity > 0 || score < thresholds.review) {
    return "no-ship";
  }

  if (status === "not_checked" || score < thresholds.ship) {
    return "review";
  }

  return "ship";
}

function withAllowlistHint(finding) {
  return {
    ...finding,
    allowlistHint: ALLOWLIST_HINT
  };
}

function isAllowlisted(finding, allow, now) {
  return Boolean(findMatchingPolicyEntry(finding, allow, now));
}

function withBaselineStatus(finding, baseline, now) {
  const entry = findMatchingPolicyEntry(finding, baseline, now);

  if (!entry) {
    return finding;
  }

  return {
    ...finding,
    status: "baseline",
    baselineReason: entry.reason,
    ...(entry.expiresAt ? { baselineExpiresAt: entry.expiresAt } : {})
  };
}

function applySeverityOverride(finding, severityOverrides) {
  const severity = severityOverrides[finding.id];

  if (!VALID_SEVERITIES.has(severity)) {
    return finding;
  }

  return {
    ...finding,
    severity
  };
}

function findMatchingPolicyEntry(finding, entries, now) {
  return entries.find((entry) => {
    if (!entry?.id || !entry?.file || !entry.reason || isExpired(entry.expiresAt, now)) {
      return false;
    }

    if (!matchesPattern(entry.id, finding.id)) {
      return false;
    }

    if (!matchesPattern(normalizePath(entry.file), normalizePath(finding.file))) {
      return false;
    }

    return entry.line === undefined || Number(entry.line) === finding.line;
  });
}

function isActiveFinding(finding) {
  return finding.status !== "baseline";
}

function isExpired(expiresAt, now) {
  if (!expiresAt) {
    return false;
  }

  const expiry = toDate(expiresAt);
  return expiry ? expiry < now : true;
}

function matchesPattern(pattern, value) {
  if (pattern === "*") {
    return true;
  }

  if (!pattern.includes("*")) {
    return pattern === value;
  }

  const source = pattern.split("*").map(escapeRegExp).join(".*");
  return new RegExp(`^${source}$`).test(value);
}

function locationForIndex(content, index) {
  const before = content.slice(0, index);
  const line = before.split("\n").length;
  const lineStart = before.lastIndexOf("\n") + 1;
  const lineEnd = content.indexOf("\n", index);
  const text = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd);

  return {
    line,
    column: index - lineStart + 1,
    text
  };
}

function redactSecretSnippet(line, name) {
  const pattern = new RegExp(`(${escapeRegExp(name)}\\s*=\\s*)(["'])?[^"'\\s#;]+`, "i");
  return line.trim().replace(pattern, `${name}=[redacted]`);
}

function toSarifLocation(finding) {
  const physicalLocation = {
    artifactLocation: { uri: normalizePath(finding.file) }
  };

  if (finding.line) {
    physicalLocation.region = {
      startLine: finding.line
    };

    if (finding.column) {
      physicalLocation.region.startColumn = finding.column;
    }
  }

  return { physicalLocation };
}

function toSarifLevel(severity) {
  return SARIF_LEVEL_BY_SEVERITY[severity] ?? "warning";
}

function toDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePath(file) {
  return file.replaceAll("\\", "/");
}
