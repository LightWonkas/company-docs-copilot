// Mutation test for the RLS suite: inject a deliberate leak, run pgTAP, and
// require at least one failure. A suite that stays green with a leak in place
// proves nothing. Each mutation runs on a freshly reset database.
//
// Uses psql inside the local DB container (as postgres) to apply mutations.
import { execSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(readFileSync("supabase/config.toml", "utf8"))?.[1];
if (!projectId) throw new Error("project_id not found in supabase/config.toml");
const container = `supabase_db_${projectId}`;

const MUTATIONS: { name: string; sql: string }[] = [
  {
    name: "chunks readable by everyone (using true)",
    sql: "create policy mutation_leak on public.chunks for select to authenticated using (true);",
  },
  {
    name: "documents readable by everyone (using true)",
    sql: "create policy mutation_leak on public.documents for select to authenticated using (true);",
  },
  {
    name: "RLS disabled on chunks",
    sql: "alter table public.chunks no force row level security; alter table public.chunks disable row level security;",
  },
  {
    name: "my_principals() ignores the user (returns every principal)",
    sql: `create or replace function private.my_principals() returns uuid[]
          language sql stable security definer set search_path = ''
          as $$ select coalesce(array_agg(distinct principal_id), '{}'::uuid[]) from public.memberships $$;`,
  },
  {
    name: "chunk ACL restamp trigger dropped",
    sql: "drop trigger documents_restamp_chunks on public.documents;",
  },
  {
    name: "executives inherit restricted docs (role grant widened)",
    sql: `create policy mutation_leak on public.chunks for select to authenticated
          using ((select private.has_role('executive')));`,
  },
  {
    name: "anon granted select on chunks",
    sql: "grant select on public.chunks to anon; create policy mutation_leak on public.chunks for select to anon using (true);",
  },
  {
    name: "audit log readable by any signed-in user",
    sql: "create policy mutation_leak on audit.rag_queries for select to authenticated using (true);",
  },
];

function sh(cmd: string, input?: string) {
  return spawnSync(cmd, { shell: true, encoding: "utf8", input });
}

function reset() {
  execSync("pnpm exec supabase db reset", { stdio: "ignore" });
}

let survived = 0;
try {
  for (const mutation of MUTATIONS) {
    reset();
    const applied = sh(`docker exec -i ${container} psql -U postgres -v ON_ERROR_STOP=1 -q`, mutation.sql);
    if (applied.status !== 0) throw new Error(`could not apply "${mutation.name}": ${applied.stderr}`);

    const tests = sh("pnpm exec supabase test db");
    const output = `${tests.stdout}${tests.stderr}`;
    const failedTests = [...output.matchAll(/# Failed test \d+: "([^"]+)"/g)].map((m) => m[1]);
    if (tests.status === 0) {
      survived++;
      console.log(`SURVIVED  ${mutation.name}`);
    } else {
      console.log(`killed    ${mutation.name}  (${failedTests.length} failing: ${failedTests.slice(0, 2).join("; ")})`);
    }
  }
} finally {
  reset();
}

console.log(`\n${MUTATIONS.length - survived}/${MUTATIONS.length} mutations killed.`);
if (survived > 0) {
  console.error("The pgTAP suite missed at least one injected leak.");
  process.exit(1);
}
