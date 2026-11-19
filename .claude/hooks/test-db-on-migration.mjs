// Claude Code PostToolUse hook (Edit|Write): after a change under
// supabase/migrations or supabase/tests, re-apply migrations and run pgTAP.
// A failure exits 2 so the output is fed back to Claude to fix immediately.
// Note: `db reset` wipes local data; re-run `pnpm seed` afterwards.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
const filePath = (input.tool_input?.file_path ?? "").replaceAll("\\", "/");
if (!/\/supabase\/(migrations|tests)\/[^/]+\.sql$/.test(filePath)) process.exit(0);

function run(args) {
  // A shell is needed to resolve pnpm on Windows; args are fixed literals below.
  const result = spawnSync(`pnpm exec supabase ${args.join(" ")}`, {
    cwd: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
    encoding: "utf8",
    shell: true,
  });
  return { ok: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

const steps = filePath.includes("/migrations/") ? [["db", "reset"], ["test", "db"]] : [["test", "db"]];
for (const step of steps) {
  const { ok, output } = run(step);
  if (!ok) {
    console.error(`supabase ${step.join(" ")} failed after editing ${filePath}:\n${output.slice(-4000)}`);
    process.exit(2);
  }
}
