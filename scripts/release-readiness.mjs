import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_VERSION = "0.2.0";

const STATIC_PACKAGE_FILES = [
  "action.yml",
  "CHANGELOG.md",
  "bin/",
  "src/",
  "scripts/mock-github-smoke.mjs",
  "scripts/pack-smoke.mjs",
  "scripts/release-readiness.mjs",
  "docs/browser-smoke.md",
  "docs/configuration.md",
  "docs/beta-test-matrix.md",
  "docs/monorepo.md",
  "docs/release-readiness.md",
  "docs/security-lite.md",
  "docs/report-schema.md",
  "docs/live-github-verification.md"
];

const ACTION_REFERENCE_DOCS = [
  "README.md",
  "docs/browser-smoke.md",
  "docs/configuration.md",
  "docs/security-lite.md",
  "docs/release-readiness.md"
];

const ACTION_INPUT_ENV = [
  ["config-path", "INPUT_CONFIG_PATH"],
  ["json-report-path", "INPUT_JSON_REPORT_PATH"],
  ["security-sarif-path", "INPUT_SECURITY_SARIF_PATH"],
  ["browser-log-dir", "INPUT_BROWSER_LOG_DIR"],
  ["screenshot-dir", "INPUT_SCREENSHOT_DIR"]
];

export async function checkReleaseReadiness({ root = process.cwd(), version = DEFAULT_VERSION } = {}) {
  const errors = [];
  const warnings = [];
  const resolvedRoot = path.resolve(root);
  const tag = `v${version}`;
  const releaseNotesPath = `docs/release-notes/${tag}.md`;
  const packageJson = await readJson(resolvedRoot, "package.json", errors);
  const packageLock = await readJson(resolvedRoot, "package-lock.json", errors);

  if (packageJson) {
    checkPackageJson(packageJson, version, releaseNotesPath, errors);
    await checkRequiredPackageFiles(resolvedRoot, releaseNotesPath, errors);
  }

  if (packageJson && packageLock) {
    checkPackageLock(packageJson, packageLock, version, errors);
  }

  await checkReleaseNotes(resolvedRoot, version, releaseNotesPath, errors);
  await checkActionReferences(resolvedRoot, tag, errors);
  await checkReleaseReadinessDoc(resolvedRoot, version, releaseNotesPath, errors);
  await checkActionWiring(resolvedRoot, errors);

  return {
    version,
    root: resolvedRoot,
    errors,
    warnings
  };
}

export function extractChangelogSection(changelog, version) {
  const normalized = normalizeLineEndings(changelog);
  const match = normalized.match(new RegExp(`^## ${escapeRegExp(version)} - .*$`, "m"));

  if (!match) {
    return null;
  }

  const start = match.index + match[0].length;
  const afterHeading = normalized.slice(start).replace(/^\n+/, "");
  const nextHeading = afterHeading.search(/^## /m);
  const section = nextHeading === -1 ? afterHeading : afterHeading.slice(0, nextHeading);

  return section.trim();
}

async function checkPackageJson(packageJson, version, releaseNotesPath, errors) {
  if (packageJson.name !== "shipproof") {
    errors.push('package.json#name must be "shipproof".');
  }

  if (packageJson.version !== version) {
    errors.push(`package.json#version must be "${version}".`);
  }

  if (packageJson.private !== true) {
    errors.push("package.json#private must stay true until npm publishing is explicitly prepared.");
  }

  if (packageJson.scripts?.["release:readiness"] !== "node scripts/release-readiness.mjs") {
    errors.push('package.json#scripts.release:readiness must be "node scripts/release-readiness.mjs".');
  }

  if (packageJson.scripts?.["pack:smoke"] !== "node scripts/pack-smoke.mjs") {
    errors.push('package.json#scripts.pack:smoke must be "node scripts/pack-smoke.mjs".');
  }

  if (packageJson.bin?.shipproof !== "./bin/shipproof.js") {
    errors.push('package.json#bin.shipproof must be "./bin/shipproof.js".');
  }

  const packageFiles = Array.isArray(packageJson.files) ? packageJson.files : [];
  const requiredFiles = [...STATIC_PACKAGE_FILES, releaseNotesPath];

  for (const requiredFile of requiredFiles) {
    if (!packageFiles.includes(requiredFile)) {
      errors.push(`package.json#files must include ${requiredFile}.`);
    }
  }

  for (const [scriptName, command] of Object.entries(packageJson.scripts ?? {})) {
    const scriptPath = command.match(/^node\s+((?:\.\/)?scripts\/\S+)/)?.[1]?.replace(/^\.\//, "");

    if (scriptPath && !packageFiles.includes(scriptPath)) {
      errors.push(`package script "${scriptName}" points to ${scriptPath}, but package.json#files does not include it.`);
    }
  }
}

function checkPackageLock(packageJson, packageLock, version, errors) {
  if (packageLock.name !== packageJson.name) {
    errors.push(`package-lock.json#name must match package.json#name "${packageJson.name}".`);
  }

  if (packageLock.version !== version) {
    errors.push(`package-lock.json#version must be "${version}".`);
  }

  const rootPackage = packageLock.packages?.[""];

  if (!rootPackage) {
    errors.push('package-lock.json#packages[""] must exist.');
    return;
  }

  if (rootPackage.name !== packageJson.name) {
    errors.push(`package-lock.json#packages[""].name must match package.json#name "${packageJson.name}".`);
  }

  if (rootPackage.version !== version) {
    errors.push(`package-lock.json#packages[""].version must be "${version}".`);
  }
}

async function checkRequiredPackageFiles(root, releaseNotesPath, errors) {
  for (const requiredFile of [...STATIC_PACKAGE_FILES, releaseNotesPath]) {
    const exists = await pathExists(path.join(root, requiredFile));

    if (!exists) {
      errors.push(`${requiredFile} must exist.`);
    }
  }
}

async function checkReleaseNotes(root, version, releaseNotesPath, errors) {
  const changelog = await readText(root, "CHANGELOG.md", errors);
  const releaseNotes = await readText(root, releaseNotesPath, errors);

  if (!changelog || !releaseNotes) {
    return;
  }

  const changelogSection = extractChangelogSection(changelog, version);

  if (!changelogSection) {
    errors.push(`CHANGELOG.md must contain a ${version} release section.`);
    return;
  }

  const expectedReleaseNotes = `# ShipProof v${version}\n\n${changelogSection}\n`;

  if (normalizeLineEndings(releaseNotes) !== expectedReleaseNotes) {
    errors.push(`${releaseNotesPath} release notes file must exactly match the ${version} section from CHANGELOG.md.`);
  }
}

async function checkActionReferences(root, tag, errors) {
  const actionReference = `kingkyylian/shipproof@${tag}`;

  for (const docPath of ACTION_REFERENCE_DOCS) {
    const text = await readText(root, docPath, errors);

    if (text && !text.includes(actionReference)) {
      errors.push(`${docPath} must reference ${actionReference}.`);
    }
  }
}

async function checkReleaseReadinessDoc(root, version, releaseNotesPath, errors) {
  const tag = `v${version}`;
  const text = await readText(root, "docs/release-readiness.md", errors);

  if (!text) {
    return;
  }

  const requiredPhrases = [
    `Package version: \`${version}\``,
    "Package is still private: `package.json#private` is `true`",
    `Missing tag: \`${tag}\``,
    `Missing GitHub release: \`${tag}\``,
    "`npm run release:readiness`",
    releaseNotesPath,
    `git tag ${tag}`,
    `git push origin ${tag}`,
    `gh release create ${tag}`,
    "Npm publishing is intentionally not ready"
  ];

  for (const phrase of requiredPhrases) {
    if (!text.includes(phrase)) {
      errors.push(`docs/release-readiness.md must include ${phrase}.`);
    }
  }
}

async function checkActionWiring(root, errors) {
  const actionYaml = await readText(root, "action.yml", errors);

  if (!actionYaml) {
    return;
  }

  if (!actionYaml.includes('run: node "$GITHUB_ACTION_PATH/bin/shipproof.js" github')) {
    errors.push('action.yml must run the GitHub Action entrypoint: node "$GITHUB_ACTION_PATH/bin/shipproof.js" github.');
  }

  for (const [inputName, envName] of ACTION_INPUT_ENV) {
    if (!new RegExp(`^\\s{2}${escapeRegExp(inputName)}:\\s*$`, "m").test(actionYaml)) {
      errors.push(`action.yml must define the ${inputName} input.`);
    }

    const envWiring = `${envName}: \${{ inputs.${inputName} }}`;

    if (!actionYaml.includes(envWiring)) {
      errors.push(`action.yml must wire ${inputName} to ${envName}.`);
    }
  }
}

async function readJson(root, relativePath, errors) {
  const text = await readText(root, relativePath, errors);

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    errors.push(`${relativePath} must be valid JSON: ${error.message}`);
    return null;
  }
}

async function readText(root, relativePath, errors) {
  try {
    return await readFile(path.join(root, relativePath), "utf8");
  } catch (error) {
    errors.push(`${relativePath} must be readable: ${error.message}`);
    return "";
  }
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeLineEndings(value) {
  return value.replace(/\r\n/g, "\n");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseArgs(argv) {
  const parsed = {
    root: process.cwd(),
    version: DEFAULT_VERSION,
    errors: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--root") {
      parsed.root = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--version") {
      parsed.version = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--help") {
      parsed.help = true;
    } else {
      parsed.errors.push(`Unknown argument: ${arg}`);
    }
  }

  if (!parsed.root) {
    parsed.errors.push("--root requires a value.");
  }

  if (!parsed.version) {
    parsed.errors.push("--version requires a value.");
  }

  return parsed;
}

async function runCli(argv) {
  const parsed = parseArgs(argv);

  if (parsed.help) {
    console.log("Usage: node scripts/release-readiness.mjs [--root <path>] [--version 0.2.0]");
    return 0;
  }

  if (parsed.errors.length > 0) {
    for (const error of parsed.errors) {
      console.error(`- ${error}`);
    }
    return 1;
  }

  const result = await checkReleaseReadiness({
    root: parsed.root,
    version: parsed.version
  });

  for (const warning of result.warnings) {
    console.warn(`- ${warning}`);
  }

  if (result.errors.length > 0) {
    console.error(`Release readiness failed for v${result.version}:`);

    for (const error of result.errors) {
      console.error(`- ${error}`);
    }

    return 1;
  }

  console.log(`Release readiness passed for v${result.version}.`);
  return 0;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  process.exitCode = await runCli(process.argv.slice(2));
}
