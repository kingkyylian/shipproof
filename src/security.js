import { readFile } from "node:fs/promises";
import path from "node:path";

const SECRET_ASSIGNMENT = /^\s*([A-Z0-9_]*(?:SECRET|TOKEN|API_KEY|PASSWORD|PRIVATE_KEY|ACCESS_KEY)[A-Z0-9_]*)\s*=\s*["']?([^"'\s#;]+)/gim;
const PLACEHOLDER_VALUE = /^(your_.*|changeme|change_me|example|dummy|test|todo|xxx|<.+>)$/i;

export function scanSecurityFindings(files) {
  const findings = [];

  for (const file of files) {
    const normalizedPath = normalizePath(file.path);
    const content = file.content ?? "";

    if (isCommittedEnvFile(normalizedPath)) {
      findings.push({
        id: "committed-env-file",
        severity: "high",
        file: file.path,
        message: "Runtime environment files should not be committed."
      });
    }

    findings.push(...findSecretFindings(file.path, content));

    if (hasUnsafeCors(content)) {
      findings.push({
        id: "unsafe-cors",
        severity: "high",
        file: file.path,
        message: "Wildcard CORS allows any origin."
      });
    }

    if (hasPublicSecret(content)) {
      findings.push({
        id: "public-secret",
        severity: "high",
        file: file.path,
        message: "Public client environment variables should not contain secrets or tokens."
      });
    }

    if (isAuthSensitivePath(normalizedPath)) {
      findings.push({
        id: "auth-sensitive-change",
        severity: "medium",
        file: file.path,
        message: "Authentication-sensitive files changed and need explicit auth coverage."
      });
    }
  }

  return findings;
}

export async function scanSecurityFindingsFromDisk({ changedFiles, cwd = process.cwd() }) {
  const files = [];

  for (const changedFile of changedFiles) {
    try {
      const content = await readFile(path.resolve(cwd, changedFile), "utf8");
      files.push({ path: changedFile, content });
    } catch {
      files.push({ path: changedFile, content: "" });
    }
  }

  return scanSecurityFindings(files);
}

export function buildSecurityCheck(findings) {
  const highCount = findings.filter((finding) => finding.severity === "high").length;
  const mediumCount = findings.filter((finding) => finding.severity === "medium").length;

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
  const uncheckedRequiredChecks = checks.filter((check) => check.required === true && check.status === "not_checked").length;
  const highRisks = risks.filter((risk) => risk.severity === "high").length;
  const mediumRisks = risks.filter((risk) => risk.severity === "medium").length;
  const highSecurity = securityFindings.filter((finding) => finding.severity === "high").length;
  const mediumSecurity = securityFindings.filter((finding) => finding.severity === "medium").length;
  const score = Math.max(
    0,
    100 -
      failedRequiredChecks * 30 -
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

function findSecretFindings(file, content) {
  const findings = [];
  const matches = content.matchAll(SECRET_ASSIGNMENT);

  for (const match of matches) {
    const name = match[1];
    const value = match[2];

    if (name.startsWith("NEXT_PUBLIC_") || PLACEHOLDER_VALUE.test(value)) {
      continue;
    }

    findings.push({
      id: "possible-secret",
      severity: "high",
      file,
      message: `${name} looks like a committed secret.`
    });
  }

  return findings;
}

function hasUnsafeCors(content) {
  return (
    /access-control-allow-origin['"]?\s*[:=]\s*['"]\*/i.test(content) ||
    /origin\s*:\s*['"]\*['"]/i.test(content)
  );
}

function hasPublicSecret(content) {
  return /NEXT_PUBLIC_[A-Z0-9_]*(SECRET|TOKEN|PRIVATE_KEY|ACCESS_KEY)\b\s*=/i.test(content);
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

function normalizePath(file) {
  return file.replaceAll("\\", "/");
}
