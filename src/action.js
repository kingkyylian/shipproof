import { createBrowserSmokePlan, runBrowserSmoke } from "./browser.js";
import { resolveShipProofConfig } from "./config.js";
import { attachReportArtifacts, runProof } from "./core.js";
import { getPullRequestContext, listPullRequestFiles, upsertShipProofComment } from "./github.js";
import { createSecuritySarif, scanSecurityFindingsFromDisk } from "./security.js";

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
  loadWorkspace,
  writeReport,
  writeJsonReport,
  writeSecuritySarif,
  appendSummary
}) {
  const resolvedConfig = resolveShipProofConfig(config);
  const context = getPullRequestContext(event, env);
  const resolvedChangedFiles = Array.isArray(changedFiles)
    ? changedFiles
    : context && request
    ? await listPullRequestFiles({ context, request })
    : [];
  const workspaceContext = loadWorkspace ? await loadWorkspace({ changedFiles: resolvedChangedFiles }) : null;
  const browserPlan = createActionBrowserPlan({ packageJson, changedFiles: resolvedChangedFiles, env, config: resolvedConfig, workspaceContext });
  let report = await runProof({
    packageJson,
    changedFiles: resolvedChangedFiles,
    config: resolvedConfig,
    workspaceContext,
    executeCommand,
    securityScan: () =>
      securityScan
        ? securityScan({ changedFiles: resolvedChangedFiles, securityConfig: resolvedConfig.security })
        : scanSecurityFindingsFromDisk({ changedFiles: resolvedChangedFiles, config: resolvedConfig.security }),
    browserSmoke: browserPlan ? () => browserSmoke({ plan: browserPlan }) : null
  });
  const reportPath = env.INPUT_REPORT_PATH || env.SHIPPROOF_REPORT_PATH || resolvedConfig.reports.markdown;
  const jsonReportPath = env.INPUT_JSON_REPORT_PATH || env.SHIPPROOF_JSON_REPORT_PATH || resolvedConfig.reports.json;
  const securitySarifPath = env.INPUT_SECURITY_SARIF_PATH || env.SHIPPROOF_SECURITY_SARIF_PATH || resolvedConfig.reports.sarif;
  const screenshotDir = env.INPUT_SCREENSHOT_DIR || resolvedConfig.browser.screenshotDir || "shipproof-screenshots";
  const browserLogDir = env.INPUT_BROWSER_LOG_DIR || resolvedConfig.browser.logDir || "shipproof-browser-logs";

  report = attachReportArtifacts(report, {
    markdown: reportPath,
    json: jsonReportPath,
    sarif: securitySarifPath,
    screenshots: screenshotDir,
    browserLogs: browserLogDir
  });

  await writeReport(reportPath, report.markdown);

  if (writeJsonReport) {
    await writeJsonReport(jsonReportPath, report);
  }

  if (writeSecuritySarif) {
    await writeSecuritySarif(securitySarifPath, createSecuritySarif(report.securityFindings));
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
    securitySarifPath,
    changedFiles: resolvedChangedFiles,
    commentAction
  };
}

function isCommentPermissionError(error) {
  return error?.status === 403 || /resource not accessible by integration|forbidden/i.test(error?.message ?? "");
}

function createActionBrowserPlan({ packageJson, changedFiles, env, config, workspaceContext }) {
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

  for (const workspacePackage of workspaceContext?.changedPackages ?? []) {
    const workspacePlan = createBrowserSmokePlan({
      packageJson: workspacePackage.packageJson,
      changedFiles,
      baseUrl: planConfig.baseUrl,
      screenshotDir: planConfig.screenshotDir,
      config: planConfig,
      packageRoot: workspacePackage.root,
      workspaceName: workspacePackage.name,
      packageManager: workspaceContext.packageManager
    });

    if (workspacePlan) {
      return workspacePlan;
    }
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
