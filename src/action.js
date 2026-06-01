import { createBrowserSmokePlan, runBrowserSmoke } from "./browser.js";
import { runProof } from "./core.js";
import { getPullRequestContext, listPullRequestFiles, upsertShipProofComment } from "./github.js";
import { scanSecurityFindingsFromDisk } from "./security.js";

export async function runGitHubProof({
  packageJson,
  event,
  env = process.env,
  changedFiles,
  executeCommand,
  request,
  securityScan,
  browserSmoke = runBrowserSmoke,
  writeReport,
  appendSummary
}) {
  const context = getPullRequestContext(event, env);
  const resolvedChangedFiles = Array.isArray(changedFiles)
    ? changedFiles
    : context && request
    ? await listPullRequestFiles({ context, request })
    : [];
  const browserPlan = createActionBrowserPlan({ packageJson, changedFiles: resolvedChangedFiles, env });
  const report = await runProof({
    packageJson,
    changedFiles: resolvedChangedFiles,
    executeCommand,
    securityScan: () =>
      securityScan
        ? securityScan({ changedFiles: resolvedChangedFiles })
        : scanSecurityFindingsFromDisk({ changedFiles: resolvedChangedFiles }),
    browserSmoke: browserPlan ? () => browserSmoke({ plan: browserPlan }) : null
  });
  const reportPath = env.INPUT_REPORT_PATH || env.SHIPPROOF_REPORT_PATH || "shipproof-report.md";

  await writeReport(reportPath, report.markdown);

  if (appendSummary) {
    await appendSummary(report.markdown);
  }

  let commentAction = "skipped";

  if (context && request && env.INPUT_COMMENT !== "false") {
    const commentResult = await upsertShipProofComment({
      context,
      markdown: report.markdown,
      request
    });
    commentAction = commentResult.action;
  }

  return {
    report,
    reportPath,
    changedFiles: resolvedChangedFiles,
    commentAction
  };
}

function createActionBrowserPlan({ packageJson, changedFiles, env }) {
  if (env.INPUT_BROWSER_SMOKE === "false") {
    return null;
  }

  return createBrowserSmokePlan({
    packageJson,
    changedFiles,
    baseUrl: env.INPUT_BROWSER_BASE_URL || undefined,
    screenshotDir: env.INPUT_SCREENSHOT_DIR || "shipproof-screenshots"
  });
}
