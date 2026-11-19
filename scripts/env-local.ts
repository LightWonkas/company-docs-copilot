// Writes the local Supabase URL and keys into .env.local from `supabase status`,
// so a fresh clone only needs ANTHROPIC_API_KEY added by hand.
// Existing entries (e.g. ANTHROPIC_API_KEY) are preserved. Values are never printed.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const ENV_FILE = ".env.local";

function parseEnv(text: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) entries.set(match[1], match[2].replace(/^"(.*)"$/, "$1"));
  }
  return entries;
}

const status = parseEnv(execSync("pnpm exec supabase status -o env", { encoding: "utf8" }));
const required = { API_URL: "", PUBLISHABLE_KEY: "", SECRET_KEY: "" };
for (const key of Object.keys(required)) {
  const value = status.get(key);
  if (!value) throw new Error(`supabase status did not report ${key}; is the stack running?`);
}

const env = existsSync(ENV_FILE) ? parseEnv(readFileSync(ENV_FILE, "utf8")) : new Map<string, string>();
env.set("NEXT_PUBLIC_SUPABASE_URL", status.get("API_URL")!);
env.set("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", status.get("PUBLISHABLE_KEY")!);
env.set("SUPABASE_SECRET_KEY", status.get("SECRET_KEY")!);

writeFileSync(ENV_FILE, [...env].map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
console.log(`Wrote local Supabase settings to ${ENV_FILE} (${env.size} variables).`);
if (!env.get("ANTHROPIC_API_KEY")) console.log("Add ANTHROPIC_API_KEY to .env.local before M3.");
