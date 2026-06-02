import { access, readdir as fsReaddir, readFile as fsReadFile } from "node:fs/promises";
import path from "node:path";

const LOCKFILES = {
  pnpm: "pnpm-lock.yaml",
  yarn: "yarn.lock",
  bun: "bun.lockb",
  npm: "package-lock.json"
};

export function detectPackageManager({ files = [] } = {}) {
  const names = new Set(files.map(normalizePath));

  if (names.has(LOCKFILES.pnpm) || names.has("pnpm-workspace.yaml")) {
    return "pnpm";
  }

  if (names.has(LOCKFILES.yarn)) {
    return "yarn";
  }

  if (names.has(LOCKFILES.bun)) {
    return "bun";
  }

  return "npm";
}

export function extractWorkspaceGlobs({ packageJson = {}, pnpmWorkspaceYaml = "" } = {}) {
  const packageWorkspaces = packageJson.workspaces;
  const globs = [];

  if (Array.isArray(packageWorkspaces)) {
    globs.push(...packageWorkspaces);
  } else if (Array.isArray(packageWorkspaces?.packages)) {
    globs.push(...packageWorkspaces.packages);
  }

  globs.push(...parsePnpmWorkspaceGlobs(pnpmWorkspaceYaml));

  return unique(globs.map(stripQuotes).filter(Boolean));
}

export function mapChangedFilesToWorkspacePackages({ packages = [], changedFiles = [] } = {}) {
  const normalizedChangedFiles = changedFiles.map(normalizePath);

  return packages.filter((workspacePackage) => {
    const root = normalizePath(workspacePackage.root);
    return normalizedChangedFiles.some((file) => file === root || file.startsWith(`${root}/`));
  });
}

export function formatWorkspaceCommand({ packageManager = "npm", workspace, script }) {
  if (packageManager === "pnpm") {
    return `pnpm --filter ${workspace} ${script}`;
  }

  if (packageManager === "yarn") {
    return `yarn workspace ${workspace} ${script}`;
  }

  if (packageManager === "bun") {
    return `bun --filter ${workspace} run ${script}`;
  }

  return script === "test"
    ? `npm --workspace ${workspace} test`
    : `npm --workspace ${workspace} run ${script}`;
}

export function formatRootCommand({ packageManager = "npm", script }) {
  if (packageManager === "pnpm") {
    return `pnpm ${script}`;
  }

  if (packageManager === "yarn") {
    return `yarn ${script}`;
  }

  if (packageManager === "bun") {
    return `bun run ${script}`;
  }

  return script === "test" ? "npm test" : `npm run ${script}`;
}

export async function loadWorkspaceContext({
  cwd = process.cwd(),
  packageJson = {},
  changedFiles = [],
  readFile = fsReadFile,
  readdir = fsReaddir,
  fileExists = defaultFileExists
} = {}) {
  const files = await detectRepoFiles({ cwd, fileExists });
  const pnpmWorkspaceYaml = await readOptionalFile(path.join(cwd, "pnpm-workspace.yaml"), readFile, fileExists);
  const globs = extractWorkspaceGlobs({ packageJson, pnpmWorkspaceYaml });
  const packages = await loadWorkspacePackages({ cwd, globs, readFile, readdir, fileExists });

  return {
    packageManager: detectPackageManager({ files }),
    packages,
    changedPackages: mapChangedFilesToWorkspacePackages({ packages, changedFiles })
  };
}

async function detectRepoFiles({ cwd, fileExists }) {
  const files = [];

  for (const file of Object.values(LOCKFILES)) {
    if (await fileExists(path.join(cwd, file))) {
      files.push(file);
    }
  }

  if (await fileExists(path.join(cwd, "pnpm-workspace.yaml"))) {
    files.push("pnpm-workspace.yaml");
  }

  return files;
}

async function loadWorkspacePackages({ cwd, globs, readFile, readdir, fileExists }) {
  const roots = unique((await Promise.all(globs.map((glob) => expandWorkspaceGlob({ cwd, glob, readdir })))).flat());
  const packages = [];

  for (const root of roots) {
    const packageJsonPath = path.join(cwd, root, "package.json");

    if (!(await fileExists(packageJsonPath))) {
      continue;
    }

    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
    packages.push({
      name: packageJson.name ?? path.posix.basename(root),
      root,
      packageJson
    });
  }

  return packages;
}

async function expandWorkspaceGlob({ cwd, glob, readdir }) {
  const normalized = normalizePath(stripQuotes(glob));

  if (!normalized.endsWith("/*")) {
    return [normalized];
  }

  const base = normalized.slice(0, -2);
  let entries = [];

  try {
    entries = await readdir(path.join(cwd, base), { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => typeof entry.isDirectory !== "function" || entry.isDirectory())
    .map((entry) => `${base}/${entry.name}`);
}

function parsePnpmWorkspaceGlobs(content) {
  const globs = [];
  let inPackages = false;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    if (trimmed === "packages:") {
      inPackages = true;
      continue;
    }

    if (!inPackages) {
      continue;
    }

    if (trimmed.startsWith("- ")) {
      globs.push(trimmed.slice(2).trim());
      continue;
    }

    if (trimmed && !line.startsWith(" ") && !line.startsWith("\t")) {
      break;
    }
  }

  return globs.map(stripQuotes);
}

async function readOptionalFile(file, readFile, fileExists) {
  if (!(await fileExists(file))) {
    return "";
  }

  return readFile(file, "utf8");
}

async function defaultFileExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function stripQuotes(value) {
  return String(value).replace(/^['"]|['"]$/g, "");
}

function normalizePath(file) {
  return file.replaceAll("\\", "/");
}

function unique(values) {
  return [...new Set(values)];
}
