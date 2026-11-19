// Claude Code PostToolUse hook (Edit|Write): after a change to retrieval code
// or the answer prompt, run the smoke eval. A gate failure (leak, injection
// success, invalid citation) exits 2 so the output goes back to Claude.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
const filePath = (input.tool_input?.file_path ?? "").replaceAll("\\", "/");
const watched = /\/src\/lib\/(retrieval\/|answer\/prompt\.ts$|ingest\/chunk\.ts$|embeddings\/)/;
if (!watched.test(filePath)) process.exit(0);

const result = spawnSync("pnpm -s eval:smoke", {
  cwd: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
  encoding: "utf8",
  shell: true,
  timeout: 280_000,
});
const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
if (result.status !== 0) {
  console.error(`Smoke eval failed after editing ${filePath}:\n${output.slice(-4000)}`);
  process.exit(2);
}
// Surface the metrics table as context on success too.
console.log(output.split("\n").filter((l) => l.startsWith("|")).join("\n"));
