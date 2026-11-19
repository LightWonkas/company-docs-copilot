import { getEmbedder, toVectorLiteral, type Embedder } from "@/lib/embeddings/embedder";
import { getAnthropic, models } from "@/lib/llm/anthropic";
import { foldTurkish } from "@/lib/text/fold";
import { RETRIEVAL, abstainThreshold, selectReranker } from "./config";
import type { Reranker } from "./rerank";
import { rewriteQuery, type RewrittenQuery, type Turn } from "./rewrite";
import type { UserSession } from "./session";

export type RetrievedChunk = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  parentId: string | null;
  headingPath: string[];
  text: string;
  lang: string;
  injectionSuspected: boolean;
  vectorRank: number | null;
  ftsRank: number | null;
  trgmRank: number | null;
  vectorSimilarity: number | null;
  rrfScore: number;
  rerankScore: number | null;
};

export type Retrieval = {
  query: RewrittenQuery;
  /** Everything RLS let through, in fused order (for debug panel and audit). */
  candidates: RetrievedChunk[];
  /** Reranked top-K for the answer model. */
  results: RetrievedChunk[];
  reranker: string;
  topScore: number;
  threshold: number;
  /** True when no permitted chunk clears the calibrated threshold. */
  belowThreshold: boolean;
  timingsMs: Record<string, number>;
};

export type RetrieveOptions = {
  history?: Turn[];
  /** Topical narrowing only (e.g. an LLM-suggested language); never an ACL. */
  documentIds?: string[];
  languages?: ("tr" | "en")[];
  topK?: number;
  embedder?: Embedder;
  reranker?: Reranker;
};

/**
 * The ONLY retrieval entry point. Every database read goes through the
 * caller's own client (their JWT), so RLS decides what can be found; nothing
 * here can widen access, and it has no ACL parameters.
 */
export async function retrieve(session: UserSession, query: string, opts: RetrieveOptions = {}): Promise<Retrieval> {
  const timings: Record<string, number> = {};
  const time = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    const t0 = performance.now();
    try {
      return await fn();
    } finally {
      timings[name] = Math.round(performance.now() - t0);
    }
  };

  const client = getAnthropic();
  const llm = client ? { client, model: models().helper } : null;
  const embedder = opts.embedder ?? getEmbedder();
  const reranker = opts.reranker ?? selectReranker(llm);

  const { rewritten } = await time("rewrite", () => rewriteQuery(query, opts.history ?? [], llm));
  const [embedding] = await time("embed", () => embedder.embedQueries([rewritten.standalone_query]));

  const { data, error } = await time("search", async () =>
    session.client.rpc("hybrid_search", {
      p_query_embedding: toVectorLiteral(embedding),
      p_query_tr: rewritten.query_tr,
      p_query_en: rewritten.query_en,
      p_query_folded: foldTurkish(rewritten.standalone_query),
      p_match_count: RETRIEVAL.rerankTopN,
      p_candidates: RETRIEVAL.candidatesPerLeg,
      p_rrf_k: RETRIEVAL.rrfK,
      p_document_ids: opts.documentIds,
      p_languages: opts.languages,
    }),
  );
  if (error) throw new Error(`hybrid_search failed: ${error.message}`);

  const candidates: RetrievedChunk[] = (data ?? []).map((r) => ({
    chunkId: r.chunk_id,
    documentId: r.document_id,
    documentTitle: r.document_title,
    parentId: r.parent_id,
    headingPath: r.heading_path,
    text: r.text,
    lang: r.lang,
    injectionSuspected: r.injection_suspected,
    vectorRank: r.vector_rank,
    ftsRank: r.fts_rank,
    trgmRank: r.trgm_rank,
    vectorSimilarity: r.vector_distance == null ? null : 1 - r.vector_distance,
    rrfScore: r.rrf_score,
    rerankScore: null,
  }));

  let scores;
  try {
    scores = await time("rerank", () =>
      reranker.rerank(
        rewritten.standalone_query,
        candidates.map((c) => ({ id: c.chunkId, title: c.documentTitle, text: c.text, vectorSimilarity: c.vectorSimilarity })),
      ),
    );
  } catch {
    // Reranker outage: degrade to fused order rather than fail the request.
    scores = candidates.map((c) => ({ id: c.chunkId, score: c.vectorSimilarity ?? 0 }));
  }
  const scoreById = new Map(scores.map((s) => [s.id, s.score]));
  for (const c of candidates) c.rerankScore = scoreById.get(c.chunkId) ?? 0;

  const ranked = [...candidates].sort((a, b) => (b.rerankScore ?? 0) - (a.rerankScore ?? 0) || b.rrfScore - a.rrfScore);
  const results = ranked.slice(0, opts.topK ?? RETRIEVAL.finalTopK);
  const topScore = results[0]?.rerankScore ?? 0;
  const threshold = abstainThreshold(reranker.id);

  return {
    query: rewritten,
    candidates,
    results,
    reranker: reranker.id,
    topScore,
    threshold,
    belowThreshold: results.length === 0 || topScore < threshold,
    timingsMs: timings,
  };
}
