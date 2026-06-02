import { createBrowserSmokePlan, runBrowserSmoke } from "./browser.js";
import { resolveShipProofConfig } from "./config.js";
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
  config,
  writeReport,
  writeJsonReport,
  appendSummary
}) {
  const resolvedConfig = resolveShipProofConfig(config);
  const context = getPullRequestContext(event, env);
  const resolvedChangedFiles = Array.isArray(changedFiles)
    ? changedFiles
    : context && request
    ? await listPullRequestFiles({ context, request })
    : [];
  const browserPlan = createActionBrowserPlan({ packageJson, changedFiles: resolvedChangedFiles, env, config: resolvedConfig });
  const report = await runProof({
    packageJson,
    changedFiles: resolvedChangedFiles,
    config: resolvedConfig,
    executeCommand,
    securityScan: () =>
      securityScan
        ? securityScan({ changedFiles: resolvedChangedFiles })
        : scanSecurityFindingsFromDisk({ changedFiles: resolvedChangedFiles }),
    browserSmoke: browserPlan ? () => browserSmoke({ plan: browserPlan }) : null
  });
  const reportPath = env.INPUT_REPORT_PATH || env.SHIPPROOF_REPORT_PATH || resolvedConfig.reports.markdown;
  const jsonReportPath = env.INPUT_JSON_REPORT_PATH || env.SHIPPROOF_JSON_REPORT_PATH || resolvedConfig.reports.json;

  await writeReport(reportPath, report.markdown);

  if (writeJsonReport) {
    await writeJsonReport(jsonReportPath, report);
  }

  if (appendSummary) {
    await appendSummary(report.markdown);
  }

  let commentAction = "skipped";

  if (context && request && env.INPUT_COMMENT !== "false") {
    try {
      const commentResult = await upsertShipProofComment({
        context,
        markdown: report.markdown,
        request
      });
      commentAction = commentResult.action;
    } catch (error) {
      if (!isCommentPermissionError(error)) {
        throw error;
      }

      commentAction = "skipped-permission";
    }
  }

  return {
    report,
    reportPath,
    jsonReportPath,
    changedFiles: resolvedChangedFiles,
    commentAction
  };
}

function isCommentPermissionError(error) {
  return error?.status === 403 || /resource not accessible by integration|forbidden/i.test(error?.message ?? "");
}

function createActionBrowserPlan({ packageJson, changedFiles, env, config }) {
  const browserConfig = config?.browser ?? {};

  if (env.INPUT_BROWSER_SMOKE === "false" || browserConfig.enabled === false) {
    return null;
  }

  const planConfig = {
    ...browserConfig,
    baseUrl: env.INPUT_BROWSER_BASE_URL || browserConfig.baseUrl || undefined,
    screenshotDir: env.INPUT_SCREENSHOT_DIR || browserConfig.screenshotDir || "shipproof-screenshots",
    logDir: env.INPUT_BROWSER_LOG_DIR || browserConfig.logDir || "shipproof-browser-logs",
    readyUrl: env.INPUT_BROWSER_READY_URL || browserConfig.readyUrl || undefined,
    timeoutMs: readNumber(env.INPUT_BROWSER_TIMEOUT_MS) ?? browserConfig.timeoutMs,
    waitUntil: env.INPUT_BROWSER_WAIT_UNTIL || browserConfig.waitUntil
  };

  if (planConfig.required === true) {
    delete planConfig.required;
  }

  return createBrowserSmokePlan({
    packageJson,
    changedFiles,
    baseUrl: planConfig.baseUrl,
    screenshotDir: planConfig.screenshotDir,
    config: planConfig
  });
}

function readNumber(value) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
