import { Suspense } from "react";
import { requireAuditor } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

type AuditRow = {
  id: number;
  created_at: string;
  user_id: string;
  channel: string;
  query_redacted: string;
  retrieved_chunk_ids: string[];
  cited_chunk_ids: string[];
  denied_chunk_ids: string[];
  model: string | null;
  abstained: boolean | null;
  citations_invalid: number;
  injection_flags: string[];
  latency_ms: number | null;
  cost_usd: number | null;
};

// Auditor-only (UI gate here, RLS on audit.rag_queries in the database).
// Rows hold ids and scores, never document text.
export default function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  return (
    <main className="flex flex-col gap-4 py-6">
      <h1 className="text-xl font-semibold">Audit log</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Rows searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Rows({ searchParams }: Pick<PageProps<"/admin/audit">, "searchParams">) {
  await requireAuditor();
  const { before } = await searchParams;
  const supabase = await createClient();
  const [{ data }, { data: people }] = await Promise.all([
    supabase.rpc("audit_log", { p_limit: 50, p_before_id: typeof before === "string" ? Number(before) : undefined }),
    supabase.from("profiles").select("id, full_name"),
  ]);
  const rows = (data ?? []) as unknown as AuditRow[];
  const name = new Map((people ?? []).map((p) => [p.id, p.full_name]));

  return (
    <>
      <table className="w-full text-left text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1">Time</th>
            <th>User</th>
            <th>Channel</th>
            <th>Query (redacted)</th>
            <th className="text-right">Retrieved / cited / denied</th>
            <th>Outcome</th>
            <th className="text-right">ms</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <td className="py-1 whitespace-nowrap">{new Date(r.created_at).toLocaleString("tr-TR")}</td>
              <td>{name.get(r.user_id) ?? r.user_id.slice(0, 8)}</td>
              <td>{r.channel}</td>
              <td className="max-w-md">{r.query_redacted}</td>
              <td className="text-right tabular-nums">
                {r.retrieved_chunk_ids.length} / {r.cited_chunk_ids.length} / {r.denied_chunk_ids.length}
              </td>
              <td>
                {r.abstained ? "abstained" : "answered"}
                {r.citations_invalid > 0 && <span className="text-destructive"> · {r.citations_invalid} invalid</span>}
                {r.injection_flags.length > 0 && <span className="text-amber-700"> · {r.injection_flags.length} quarantined</span>}
              </td>
              <td className="text-right tabular-nums">{r.latency_ms}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 50 && (
        <a className="text-sm underline" href={`/admin/audit?before=${rows[rows.length - 1].id}`}>
          Older →
        </a>
      )}
    </>
  );
}
