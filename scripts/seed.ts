// Resets the LOCAL database, then seeds the Atlas Lojistik org, its personas
// (seed/org.json) and, once ingestion exists, the synthetic corpus.
// This is an admin job, so it uses the secret key; it refuses non-local hosts.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

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

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const demoPassword = process.env.DEMO_PASSWORD;
if (!url || !secretKey || !demoPassword) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY / DEMO_PASSWORD; run `pnpm env:local`.");
}

// Seeding wipes data with the secret key. Refuse anything but the local stack.
const { hostname } = new URL(url);
if (!LOCAL_HOSTS.has(hostname)) throw new Error(`Refusing to seed non-local Supabase host "${hostname}".`);

if (!process.argv.includes("--no-reset")) {
  execSync("pnpm exec supabase db reset", { stdio: "inherit" });
}

const db = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

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
