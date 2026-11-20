import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import type { Embedder } from "@/lib/embeddings/embedder";
import { FusionOnlyReranker, LlmListwiseReranker } from "@/lib/retrieval/rerank";
import { retrieve } from "@/lib/retrieval/retrieve";
import { heuristicRewrite } from "@/lib/retrieval/rewrite";
import type { UserSession } from "@/lib/retrieval/session";

vi.mock("@/lib/llm/anthropic", async (orig) => ({
  ...(await orig<typeof import("@/lib/llm/anthropic")>()),
  getAnthropic: () => null,
}));

const fakeEmbedder: Embedder = {
  id: "fake",
  dims: 3,
  maxTokens: 512,
  embedQueries: async (t) => t.map(() => [0.1, 0.2, 0.3]),
  embedPassages: async (t) => t.map(() => [0.1, 0.2, 0.3]),
  countTokens: async (t) => t.length,
};

function row(id: string, distance: number, rrf: number) {
  return {
    chunk_id: id, document_id: `d-${id}`, document_title: `Doc ${id}`, parent_id: null, heading_path: [],
    text: `text ${id}`, lang: "tr", injection_suspected: false, vector_rank: 1, fts_rank: null,
    trgm_rank: null, vector_distance: distance, rrf_score: rrf,
  };
}

function session(rows: ReturnType<typeof row>[]) {
  const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });
  return { rpc, session: { userId: "u1", channel: "eval", client: { rpc }, __brand: "UserSession" } as unknown as UserSession };
}

describe("heuristicRewrite", () => {
  it.each([
    ["Yıllık izin kaç gün?", "tr"],
    ["sirket arac politikasi nedir", "tr"],
    ["How many vacation days do I get?", "en"],
  ])("detects %s as %s", (q, lang) => {
    expect(heuristicRewrite(q).lang).toBe(lang);
  });
});

describe("retrieve", () => {
  it("calls hybrid_search through the user's own client with no ACL parameters", async () => {
    const { rpc, session: s } = session([row("a", 0.1, 0.03)]);
    await retrieve(s, "Yıllık izin kaç gün?", { embedder: fakeEmbedder, reranker: new FusionOnlyReranker() });
    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, params] = rpc.mock.calls[0];
    expect(fn).toBe("hybrid_search");
    expect(Object.keys(params).some((k) => /principal|acl|role|user/i.test(k))).toBe(false);
    expect(params.p_query_folded).toBe("yillik izin kac gun?");
  });

  it("abstains (belowThreshold) when the best score is under the calibrated threshold", async () => {
    const { session: s } = session([row("a", 0.4, 0.03)]); // cosine similarity 0.6 < 0.8
    const r = await retrieve(s, "unrelated", { embedder: fakeEmbedder, reranker: new FusionOnlyReranker() });
    expect(r.belowThreshold).toBe(true);
  });

  it("abstains when RLS returns nothing", async () => {
    const { session: s } = session([]);
    const r = await retrieve(s, "board notes", { embedder: fakeEmbedder, reranker: new FusionOnlyReranker() });
    expect(r.results).toEqual([]);
    expect(r.belowThreshold).toBe(true);
  });

  it("orders results by rerank score and degrades to fused order if the reranker fails", async () => {
    const { session: s } = session([row("a", 0.1, 0.03), row("b", 0.05, 0.02)]);
    const failing = { id: "x", rerank: vi.fn().mockRejectedValue(new Error("down")) };
    const r = await retrieve(s, "q", { embedder: fakeEmbedder, reranker: failing });
    expect(r.results.map((c) => c.chunkId)).toEqual(["b", "a"]); // b has higher similarity
  });
});

describe("LlmListwiseReranker", () => {
  it("maps 1-based passage numbers back to ids and scores skipped passages 0", async () => {
    const parse = vi.fn().mockResolvedValue({
      parsed_output: { scores: [{ passage: 2, relevance: 0.9 }] },
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const reranker = new LlmListwiseReranker({ client: { messages: { parse } } as unknown as Anthropic, model: "m" });
    const scores = await reranker.rerank("q", [
      { id: "a", title: "A", text: "x", vectorSimilarity: 0.9 },
      { id: "b", title: "B", text: "y", vectorSimilarity: 0.8 },
    ]);
    expect(scores).toEqual([{ id: "a", score: 0 }, { id: "b", score: 0.9 }]);
    expect(parse.mock.calls[0][0].system).toMatch(/untrusted/);
  });
});
