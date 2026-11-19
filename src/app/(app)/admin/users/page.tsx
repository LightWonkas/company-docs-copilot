import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CreateUserForm, EditUserForm } from "./user-forms";

export default function UsersPage() {
  return (
    <main className="flex flex-col gap-6 py-6">
      <h1 className="text-xl font-semibold">Users</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Users />
      </Suspense>
    </main>
  );
}

async function Users() {
  const me = await requireAdmin();
  const supabase = await createClient();
  // All reads go through RLS with the admin's own JWT.
  const [profiles, departments, teams] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, role, is_auditor, department_id, team_id").order("full_name"),
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("teams").select("id, name").order("name"),
  ]);
  const deptOptions = departments.data ?? [];
  const teamOptions = teams.data ?? [];

  return (
    <>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Provision a user</h2>
        <CreateUserForm departments={deptOptions} teams={teamOptions} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">{profiles.data?.length ?? 0} users</h2>
        <ul className="flex flex-col divide-y rounded-lg border">
          {(profiles.data ?? []).map((p) => (
            <li key={p.id} className="flex flex-col gap-2 p-3">
              <div className="text-sm">
                <span className="font-medium">{p.full_name}</span>{" "}
                <span className="text-muted-foreground">{p.email}</span>
              </div>
              {p.id === me.id ? (
                <p className="text-xs text-muted-foreground">
                  You can&apos;t edit your own account (prevents self-escalation).
                </p>
              ) : (
                <EditUserForm
                  row={{
                    id: p.id,
                    email: p.email,
                    fullName: p.full_name,
                    role: p.role,
                    isAuditor: p.is_auditor,
                    departmentId: p.department_id,
                    teamId: p.team_id,
                  }}
                  departments={deptOptions}
                  teams={teamOptions}
                />
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
