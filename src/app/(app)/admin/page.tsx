import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

type Dashboard = {
  documents: { total: number; ready: number; pending: number; failed: number; flagged: number; chunks: number; byScope: Record<string, number> | null };
  coverage: { department: string; documents: number; chunks: number }[];
  queries: {
    total: number;
    last7d: number;
    abstained: number;
    invalidCitations: number;
    byChannel: Record<string, number> | null;
    p50LatencyMs: number | null;
    p95LatencyMs: number | null;
    costUsd: number;
  };
  topQuestions: { question: string; n: number }[];
  unanswered: { question: string; n: number }[];
  feedback: { up: number; down: number; recentReasons: string[] };
};

// Every number on this page comes from public.admin_dashboard() (SQL), never
// from a model.
export default function DashboardPage() {
  return (
    <main className="flex flex-col gap-6 py-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Stats />
      </Suspense>
    </main>
  );
}

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function QuestionList({ title, rows }: { title: string; rows: { question: string; n: number }[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing asked at least twice yet.</p>
      ) : (
        <ol className="flex flex-col gap-1 text-sm">
          {rows.map((r, i) => (
            <li key={i} className="flex justify-between gap-4 border-b py-1">
              <span>{r.question}</span>
              <span className="tabular-nums text-muted-foreground">{r.n}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

async function Stats() {
  const user = await requireUser();
  if (user.role !== "admin" && !user.isAuditor) redirect("/?error=forbidden");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_dashboard");
  if (error || !data) return <p className="text-sm text-destructive">Could not load dashboard.</p>;
  const d = data as unknown as Dashboard;
  const abstainRate = d.queries.total ? Math.round((d.queries.abstained / d.queries.total) * 100) : 0;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Documents ready" value={d.documents.ready} hint={`${d.documents.total} total · ${d.documents.chunks} chunks`} />
        <Tile label="Pending / failed" value={`${d.documents.pending} / ${d.documents.failed}`} />
        <Tile label="Injection-flagged docs" value={d.documents.flagged} />
        <Tile label="Questions (7 days)" value={d.queries.last7d} hint={`${d.queries.total} total`} />
        <Tile label="Abstained" value={`${abstainRate}%`} hint={`${d.queries.abstained} questions`} />
        <Tile label="Invalid citations" value={d.queries.invalidCitations} hint="dropped by the validator" />
        <Tile label="Latency p50 / p95" value={`${Math.round(d.queries.p50LatencyMs ?? 0)} / ${Math.round(d.queries.p95LatencyMs ?? 0)} ms`} />
        <Tile label="LLM cost" value={`$${Number(d.queries.costUsd).toFixed(4)}`} hint={`👍 ${d.feedback.up} · 👎 ${d.feedback.down}`} />
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Coverage by department (ready documents)</h2>
        <table className="w-full max-w-lg text-sm">
          <tbody className="divide-y">
            {d.coverage.map((c) => (
              <tr key={c.department}>
                <td className="py-1">{c.department}</td>
                <td className="text-right tabular-nums">{c.documents} docs</td>
                <td className="text-right tabular-nums text-muted-foreground">{c.chunks} chunks</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="grid gap-6 md:grid-cols-2">
        <QuestionList title="Top questions" rows={d.topQuestions} />
        <QuestionList title="Top unanswered questions (content gaps)" rows={d.unanswered} />
      </div>
      {d.feedback.recentReasons.length > 0 && (
        <section className="flex flex-col gap-1 text-sm">
          <h2 className="font-medium">Recent 👎 reasons</h2>
          {d.feedback.recentReasons.map((r, i) => (
            <p key={i} className="text-muted-foreground">
              “{r}”
            </p>
          ))}
        </section>
      )}
    </>
  );
}
