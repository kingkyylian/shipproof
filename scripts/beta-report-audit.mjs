export function summarizeReport(report) {
  return {
    schemaVersion: report.schemaVersion,
    status: report.status,
    decision: report.decision,
    score: report.score,
    checkCount: Array.isArray(report.checks) ? report.checks.length : 0,
    securityFindings: Array.isArray(report.securityFindings) ? report.securityFindings.length : 0
  };
}
