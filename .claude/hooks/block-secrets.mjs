// Secret guard, used two ways:
//  1. Claude Code PreToolUse hook (Bash): blocks `git commit` when staged
//     changes, or the command itself, contain a secret. Exit 2 = blocked.
//  2. `node .claude/hooks/block-secrets.mjs --tracked` (pnpm check:secrets, CI):
//     scans every tracked file, catching commits made outside Claude.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Real values only: empty placeholders in .env.example must not trip this.
const PATTERNS = [
  { name: "Supabase secret key", re: /sb_secret_[A-Za-z0-9_-]{20,}/ },
  { name: "Anthropic API key", re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "ANTHROPIC_API_KEY value", re: /ANTHROPIC_API_KEY\s*=\s*["']?[A-Za-z0-9_-]{20,}/ },
];

function findSecrets(text) {
  return PATTERNS.filter(({ re }) => re.test(text)).map(({ name }) => name);
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function scanTracked() {
  const hits = [];
  for (const file of git("ls-files", "-z").split("\0").filter(Boolean)) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue; // deleted in the working tree
    }
    for (const name of findSecrets(text)) hits.push(`${file}: ${name}`);
  }
  if (hits.length) {
    console.error(`Secrets found in tracked files:\n${hits.join("\n")}`);
    process.exit(1);
  }
  console.log("No secrets found in tracked files.");
}

function hook() {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const command = input.tool_input?.command ?? "";
  if (!/\bgit\b[^|;&]*\bcommit\b/.test(command)) return;

  const inCommand = findSecrets(command);
  // Only added lines matter; removing a leaked secret must stay possible.
  const added = git("diff", "--cached", "-U0", "--no-color")
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .join("\n");
  const inDiff = findSecrets(added);

  if (inCommand.length || inDiff.length) {
    console.error(
      `Commit blocked: ${[...new Set([...inCommand, ...inDiff])].join(", ")} detected. ` +
        "Keep secrets in .env.local (gitignored) and unstage the file.",
    );
    process.exit(2);
  }
}

if (process.argv.includes("--tracked")) scanTracked();
else hook();
