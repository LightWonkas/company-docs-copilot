import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { deleteDocument } from "./actions";
import { UploadForm } from "./upload-form";

export default function DocumentsPage() {
  return (
    <main className="flex flex-col gap-6 py-6">
      <h1 className="text-xl font-semibold">Documents</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Documents />
      </Suspense>
    </main>
  );
}

const STATUS_STYLE: Record<string, string> = {
  ready: "text-emerald-700",
  pending: "text-amber-700",
  processing: "text-amber-700",
  failed: "text-destructive",
};

async function Documents() {
  await requireAdmin();
  const supabase = await createClient();
  const [docs, departments, teams, roles, profiles] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title, language, scope, status, version, chunk_count, injection_flags, error, updated_at, departments(name), teams(name)")
      .order("title"),
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("teams").select("id, name").order("name"),
    supabase.from("roles").select("id, key").order("key"),
    supabase.from("profiles").select("id, full_name").order("full_name"),
  ]);
  const principals = [
    ...(roles.data ?? []).map((r) => ({ id: `role:${r.id}`, name: `Role: ${r.key}` })),
    ...(profiles.data ?? []).map((p) => ({ id: `user:${p.id}`, name: p.full_name })),
  ];

  return (
    <>
      <UploadForm
        departments={departments.data ?? []}
        teams={teams.data ?? []}
        principals={principals}
        documents={(docs.data ?? []).map((d) => ({ id: d.id, name: d.title }))}
      />
      <p className="text-xs text-muted-foreground">
        Admins see every document&apos;s metadata to manage it, but can only read the content of
        documents they are allowed to see.
      </p>
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="py-2">Title</th>
            <th>Scope</th>
            <th>Lang</th>
            <th>Status</th>
            <th className="text-right">Chunks</th>
            <th>Injection flags</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y">
          {(docs.data ?? []).map((d) => (
            <tr key={d.id} className="align-top">
              <td className="py-2 pr-2">
                {d.title} <span className="text-xs text-muted-foreground">v{d.version}</span>
              </td>
              <td className="pr-2">
                {d.scope}
                {d.departments?.name ? ` · ${d.departments.name}` : ""}
                {d.teams?.name ? ` · ${d.teams.name}` : ""}
              </td>
              <td className="pr-2 uppercase">{d.language}</td>
              <td className={`pr-2 ${STATUS_STYLE[d.status] ?? ""}`} title={d.error ?? undefined}>
                {d.status}
              </td>
              <td className="pr-2 text-right tabular-nums">{d.chunk_count}</td>
              <td className="pr-2 text-xs text-destructive">{d.injection_flags.join(", ")}</td>
              <td>
                <form action={deleteDocument}>
                  <input type="hidden" name="documentId" value={d.id} />
                  <button type="submit" className="text-xs text-muted-foreground hover:text-destructive">
                    Delete
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
