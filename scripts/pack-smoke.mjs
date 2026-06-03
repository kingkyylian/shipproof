import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function runPackSmoke({ root = process.cwd(), keepTemp = true } = {}) {
  const resolvedRoot = path.resolve(root);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "shipproof-pack-smoke-"));

  try {
    const packResult = await runCommand("npm", ["pack", "--pack-destination", tempDir], { cwd: resolvedRoot });
    const tarballName = extractTarballName(packResult.stdout);

    if (!tarballName) {
      throw new Error(`npm pack did not print a tarball name.\n${packResult.stdout}`);
    }

    const tarballPath = path.join(tempDir, tarballName);
    await runCommand("tar", ["-xzf", tarballPath, "-C", tempDir]);

    const packageRoot = path.join(tempDir, "package");
    const packedPackageJson = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
    const packedCliPath = path.join(packageRoot, "bin", "shipproof.js");
    await runCommand("node", [packedCliPath, "--help"], { cwd: packageRoot });

    const fixtureRoot = path.join(tempDir, "fixture");
    const jsonReportPath = path.join(tempDir, "fixture-report.json");
    const sarifPath = path.join(tempDir, "fixture-security.sarif");

    await createFixture(fixtureRoot);
    await runCommand(
      "node",
      [
        packedCliPath,
        "--changed",
        "src/index.js",
        "--no-browser",
        "--json-report-path",
        jsonReportPath,
        "--security-sarif-path",
        sarifPath
      ],
      { cwd: fixtureRoot }
    );

    const report = JSON.parse(await readFile(jsonReportPath, "utf8"));
    const sarif = JSON.parse(await readFile(sarifPath, "utf8"));

    assertPackSmokeResult({ report, sarif });

    return {
      tempDir,
      tarballPath,
      packageName: packedPackageJson.name,
      packageVersion: packedPackageJson.version,
      packedCliPath,
      jsonReportPath,
      sarifPath,
      report,
      sarif
    };
  } finally {
    if (!keepTemp) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

async function createFixture(fixtureRoot) {
  await mkdir(path.join(fixtureRoot, "src"), { recursive: true });
  await writeFile(
    path.join(fixtureRoot, "package.json"),
    JSON.stringify(
      {
        type: "module",
        scripts: {
          test: "node --test"
        }
      },
      null,
      2
    )
  );
  await writeFile(path.join(fixtureRoot, "src", "index.js"), "export const ok = true;\n");
}

function assertPackSmokeResult({ report, sarif }) {
  const sarifResults = sarif.runs?.[0]?.results;

  if (report.schemaVersion !== "1.0") {
    throw new Error(`Expected JSON schemaVersion 1.0, got ${report.schemaVersion}.`);
  }

  if (report.status !== "passed" || report.decision !== "ship" || report.score !== 100) {
    throw new Error(`Expected packed CLI proof to pass with ship/100, got ${report.status}/${report.decision}/${report.score}.`);
  }

  if (sarif.version !== "2.1.0") {
    throw new Error(`Expected SARIF 2.1.0, got ${sarif.version}.`);
  }

  if (!Array.isArray(sarifResults) || sarifResults.length !== 0) {
    throw new Error(`Expected SARIF to contain 0 results, got ${sarifResults?.length}.`);
  }
}

function extractTarballName(stdout) {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.endsWith(".tgz"));
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited ${code}\n${stdout}\n${stderr}`));
    });
  });
}

function parseArgs(argv) {
  const parsed = {
    root: process.cwd(),
    keepTemp: true,
    errors: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--root") {
      parsed.root = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--clean") {
      parsed.keepTemp = false;
    } else if (arg === "--help") {
      parsed.help = true;
    } else {
      parsed.errors.push(`Unknown argument: ${arg}`);
    }
  }

  if (!parsed.root) {
    parsed.errors.push("--root requires a value.");
  }

  return parsed;
}

async function runCli(argv) {
  const parsed = parseArgs(argv);

  if (parsed.help) {
    console.log("Usage: node scripts/pack-smoke.mjs [--root <path>] [--clean]");
    return 0;
  }

  if (parsed.errors.length > 0) {
    for (const error of parsed.errors) {
      console.error(`- ${error}`);
    }
    return 1;
  }

  try {
    const result = await runPackSmoke({ root: parsed.root, keepTemp: parsed.keepTemp });

    console.log(`Pack smoke passed for ${result.packageName}@${result.packageVersion}.`);

    if (parsed.keepTemp) {
      console.log(`Tarball: ${result.tarballPath}`);
      console.log(`JSON report: ${result.jsonReportPath}`);
      console.log(`SARIF report: ${result.sarifPath}`);
    } else {
      console.log("Temporary pack smoke artifacts removed.");
    }

    return 0;
  } catch (error) {
    console.error(`Pack smoke failed: ${error.message}`);
    return 1;
  }
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  process.exitCode = await runCli(process.argv.slice(2));
}
