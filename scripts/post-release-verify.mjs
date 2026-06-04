import path from "node:path";
import { fileURLToPath } from "node:url";

export function parseReleaseView(stdout) {
  const parsed = JSON.parse(stdout);

  return {
    tagName: parsed.tagName,
    name: parsed.name,
    url: parsed.url,
    isDraft: parsed.isDraft,
    isPrerelease: parsed.isPrerelease,
    publishedAt: parsed.publishedAt,
    targetCommitish: parsed.targetCommitish
  };
}

function parseArgs(argv) {
  const parsed = { version: "", errors: [] };

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--version") {
      parsed.version = argv[index + 1] ?? "";
      index += 1;
    } else {
      parsed.errors.push(`Unknown argument: ${argv[index]}`);
    }
  }

  if (!parsed.version) {
    parsed.errors.push("--version requires a value.");
  }

  return parsed;
}

async function runCli(argv) {
  const parsed = parseArgs(argv);

  if (parsed.errors.length > 0) {
    for (const error of parsed.errors) {
      console.error(`- ${error}`);
    }
    return 1;
  }

  console.log(`Run these checks for v${parsed.version}:`);
  console.log(`git ls-remote --tags origin "v${parsed.version}*"`);
  console.log(`gh release view v${parsed.version} --json tagName,name,url,isDraft,isPrerelease,publishedAt,targetCommitish`);
  return 0;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  process.exitCode = await runCli(process.argv.slice(2));
}
