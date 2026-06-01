export function createAgentFeedbackPrompt({
  decision,
  status,
  score,
  checks,
  risks,
  securityFindings,
  suggestedNextTests,
  changedFiles
}) {
  if (decision === "ship" && status === "passed") {
    return null;
  }

  const lines = [
    "Fix the ShipProof failures before merge.",
    "",
    `Decision: ${decision} (score ${score}/100, status ${status})`
  ];
  const failedChecks = checks.filter((check) => check.status === "failed" || check.status === "not_checked");

  if (failedChecks.length > 0) {
    lines.push("", "Failed or incomplete checks:");

    for (const check of failedChecks) {
      lines.push(`- ${check.name}: ${check.status}${check.summary ? ` - ${check.summary}` : ""}`);
    }
  }

  if (securityFindings.length > 0) {
    lines.push("", "Security findings:");

    for (const finding of securityFindings) {
      lines.push(`- ${finding.id} (${finding.severity}) in ${finding.file}: ${finding.message}`);
    }
  }

  if (risks.length > 0) {
    lines.push("", "Risk areas:");

    for (const risk of risks) {
      lines.push(`- ${risk.category} (${risk.severity}): ${risk.files.join(", ")}`);
    }
  }

  if (suggestedNextTests.length > 0) {
    lines.push("", "Add or run these checks:");

    for (const test of suggestedNextTests) {
      lines.push(`- ${test}`);
    }
  }

  lines.push("", "Constraints:", "- Do not refactor unrelated files.", "- Keep the fix scoped to the files and failures above.");

  if (changedFiles.length > 0) {
    lines.push("", "Re-run:", `npm run shipproof -- --changed ${changedFiles.join(",")}`);
  }

  return lines.join("\n");
}
