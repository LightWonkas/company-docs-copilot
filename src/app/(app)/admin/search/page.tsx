import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/session";
import { retrieve } from "@/lib/retrieval/retrieve";
import { userSessionFromClient } from "@/lib/retrieval/session";
import { createClient } from "@/lib/supabase/server";

// Retrieval debug panel. It runs as the signed-in admin, so it shows exactly
// what an admin is allowed to retrieve: debugging never bypasses RLS.
export default function SearchDebugPage({ searchParams }: PageProps<"/admin/search">) {
  return (
    <main className="flex flex-col gap-4 py-6">
      <h1 className="text-xl font-semibold">Retrieval debug</h1>
      <form className="flex gap-2">
        <input
          name="q"
          placeholder="Ask a question…"
          className="h-9 flex-1 rounded-lg border bg-background px-3 text-sm"
          aria-label="Query"
        />
        <button type="submit" className="rounded-lg border px-3 text-sm hover:bg-muted">
          Search
        </button>
      </form>
      <Suspense fallback={<p className="text-muted-foreground">Searching…</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const fmt = (n: number | null, digits = 3) => (n == null ? "—" : n.toFixed(digits));

async function Results({ searchParams }: Pick<PageProps<"/admin/search">, "searchParams">) {
  await requireAdmin();
  const { q } = await searchParams;
  if (typeof q !== "string" || !q.trim()) return null;

  const session = await userSessionFromClient(await createClient());
  const r = await retrieve(session, q);
  const finalIds = new Set(r.results.map((c) => c.chunkId));
  const ranked = [...r.candidates].sort((a, b) => (b.rerankScore ?? 0) - (a.rerankScore ?? 0));

  return (
    <section className="flex flex-col gap-3 text-sm">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 rounded-lg border p-3">
        <dt className="text-muted-foreground">Rewrite</dt>
        <dd>
          [{r.query.lang}] {r.query.standalone_query} · TR: {r.query.query_tr} · EN: {r.query.query_en}
        </dd>
        <dt className="text-muted-foreground">Reranker</dt>
        <dd>
          {r.reranker} · top-1 {fmt(r.topScore)} vs threshold {fmt(r.threshold)} →{" "}
          <strong>{r.belowThreshold ? "abstain (LLM not called)" : "answer"}</strong>
        </dd>
        <dt className="text-muted-foreground">Timings</dt>
        <dd>{Object.entries(r.timingsMs).map(([k, v]) => `${k} ${v}ms`).join(" · ")}</dd>
      </dl>
      <table className="w-full text-left">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="py-1">#</th>
            <th>Document / chunk</th>
            <th className="text-right">vec rank</th>
            <th className="text-right">cos sim</th>
            <th className="text-right">FTS rank</th>
            <th className="text-right">trgm rank</th>
            <th className="text-right">RRF</th>
            <th className="text-right">rerank</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {ranked.map((c, i) => (
            <tr key={c.chunkId} className={finalIds.has(c.chunkId) ? "" : "text-muted-foreground"}>
              <td className="py-1 align-top">{i + 1}</td>
              <td className="max-w-xl align-top">
                <div className="font-medium">
                  {c.documentTitle}
                  {c.injectionSuspected && <span className="ml-2 text-xs text-destructive">quarantined</span>}
                  {finalIds.has(c.chunkId) && <span className="ml-2 text-xs text-emerald-700">→ answer context</span>}
                </div>
                <div className="text-xs text-muted-foreground">{c.headingPath.join(" › ")}</div>
                <div className="line-clamp-2 text-xs">{c.text}</div>
              </td>
              <td className="text-right align-top tabular-nums">{c.vectorRank ?? "—"}</td>
              <td className="text-right align-top tabular-nums">{fmt(c.vectorSimilarity)}</td>
              <td className="text-right align-top tabular-nums">{c.ftsRank ?? "—"}</td>
              <td className="text-right align-top tabular-nums">{c.trgmRank ?? "—"}</td>
              <td className="text-right align-top tabular-nums">{fmt(c.rrfScore, 4)}</td>
              <td className="text-right align-top tabular-nums">{fmt(c.rerankScore)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
