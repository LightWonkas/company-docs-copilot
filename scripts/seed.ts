// Resets the LOCAL database, then seeds the Atlas Lojistik org, its personas
// (seed/org.json) and the synthetic corpus, and runs the ingest worker.
// This is an admin job, so it uses the secret key; it refuses non-local hosts.
//   --no-reset   keep the current database
//   --no-corpus  personas only
//   --no-llm     ingest without Contextual Retrieval / LLM screen (ablation baseline)
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { uploadCorpus } from "./lib/corpus";
import { loadEnv, requireEnv, serviceClient } from "./lib/local";

type Org = {
  org: { slug: string; name: string };
  departments: { slug: string; name: string }[];
  teams: { slug: string; department: string; name: string }[];
  personas: {
    key: string;
    name: string;
    department: string | null;
    team: string | null;
    role: "employee" | "team_lead" | "department_head" | "executive" | "admin";
    auditor: boolean;
  }[];
  emailDomain: string;
};

loadEnv();
const db = serviceClient(); // throws for non-local hosts: seeding wipes data
const demoPassword = requireEnv("DEMO_PASSWORD");

if (!process.argv.includes("--no-reset")) {
  execSync("pnpm exec supabase db reset", { stdio: "inherit" });
}

async function must<T>(
  label: string,
  p: PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data as NonNullable<T>;
}

const spec: Org = JSON.parse(readFileSync("seed/org.json", "utf8"));

const org = await must("org", db.from("orgs").insert(spec.org).select("id").single());
const departments = await must(
  "departments",
  db.from("departments").insert(spec.departments.map((d) => ({ ...d, org_id: org.id }))).select("id, slug"),
);
const deptId = new Map(departments.map((d) => [d.slug, d.id]));
const teams = await must(
  "teams",
  db
    .from("teams")
    .insert(spec.teams.map((t) => ({ slug: t.slug, name: t.name, org_id: org.id, department_id: deptId.get(t.department)! })))
    .select("id, slug"),
);
const teamId = new Map(teams.map((t) => [t.slug, t.id]));

for (const p of spec.personas) {
  const email = `${p.key}@${spec.emailDomain}`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: demoPassword,
    email_confirm: true,
    user_metadata: { full_name: p.name },
  });
  if (error) throw new Error(`user ${email}: ${error.message}`);
  await must(
    `profile ${email}`,
    db.from("profiles").insert({
      id: data.user.id,
      org_id: org.id,
      email,
      full_name: p.name,
      role: p.role,
      is_auditor: p.auditor,
      department_id: p.department ? deptId.get(p.department)! : null,
      team_id: p.team ? teamId.get(p.team)! : null,
    }),
  );
}

console.log(`Seeded ${spec.org.name}: ${departments.length} departments, ${teams.length} teams, ${spec.personas.length} personas.`);

if (!process.argv.includes("--no-corpus")) {
  const count = await uploadCorpus(db, org.id, spec.emailDomain);
  console.log(`Uploaded ${count} corpus documents; ingesting…`);
  const { getEmbedder } = await import("../src/lib/embeddings/embedder");
  const { getHelperLlm } = await import("../src/lib/llm/provider");
  const { drainQueue } = await import("../src/lib/ingest/worker");
  const llm = process.argv.includes("--no-llm") ? null : getHelperLlm();
  if (!llm) console.log("No LLM configured (ANTHROPIC_API_KEY / LLM_PROVIDER): no contextual retrieval, pattern-only injection screen.");
  const stats = await drainQueue({ db, embedder: getEmbedder(), llm });
  const chunks = stats.processed.reduce((n, r) => n + r.chunks, 0);
  const flagged = stats.processed.filter((r) => r.flags.length).length;
  console.log(
    `Ingested ${stats.processed.length} documents (${chunks} chunks, ${flagged} with injection flags), ${stats.failed.length} failed.`,
  );
  for (const f of stats.failed) console.error(`  FAILED ${f.documentId}: ${f.error}`);
}
