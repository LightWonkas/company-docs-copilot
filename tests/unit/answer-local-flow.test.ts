import { afterEach, describe, expect, it, vi } from "vitest";
import { answerQuestion, type AnswerEvent } from "@/lib/answer/answer";
import { LocalLlmClient } from "@/lib/llm/local";
import { setLlmForTesting } from "@/lib/llm/provider";
import type { Retrieval, RetrievedChunk } from "@/lib/retrieval/retrieve";
import type { UserSession } from "@/lib/retrieval/session";

const chunk = (id: string, text: string): RetrievedChunk => ({
  chunkId: id, documentId: `d-${id}`, documentTitle: `Doc ${id}`, parentId: null, headingPath: [], text, lang: "en",
  injectionSuspected: false, vectorRank: 1, ftsRank: null, trgmRank: null, vectorSimilarity: 0.9, rrfScore: 0.1, rerankScore: 0.9,
});

const results = [chunk("c1", "Employees get 16 days. Seniors get 22 days."), chunk("c2", "Per diem is 1,250 TL.")];

vi.mock("@/lib/retrieval/retrieve", () => ({
  retrieve: async (): Promise<Retrieval> => ({
    query: { lang: "en", standalone_query: "How many leave days?", query_tr: "q", query_en: "q" },
    candidates: results, ranked: results, results, reranker: "local-listwise-m", topScore: 0.9, threshold: 0.5,
    belowThreshold: false, timingsMs: {},
  }),
}));

/** An OpenAI-compatible server that streams `content` in small pieces. */
function streamingServer(content: string, reasoning = false) {
  const bodies: Record<string, unknown>[] = [];
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    const pieces = content.match(/[\s\S]{1,4}/g) ?? [];
    const sse = [
      ...pieces.map((p) => `data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`),
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 20 } })}\n\n`,
      "data: [DONE]\n\n",
    ].join("");
    return new Response(sse);
  });
  setLlmForTesting({
    provider: "openai-compatible",
    client: new LocalLlmClient({ baseUrl: "http://local/v1", timeoutMs: 1000, reasoning, fetch: fetch as unknown as typeof globalThis.fetch }),
    models: { answer: "local-answer", helper: "local-helper" },
  });
  return bodies;
}

function session() {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  return { rpc, session: { userId: "u1", channel: "eval", client: { rpc }, __brand: "UserSession" } as unknown as UserSession };
}

afterEach(() => setLlmForTesting(undefined));

describe("answerQuestion with a local model", () => {
  it("streams marker-free text and returns validated citations in the native block shape", async () => {
    const bodies = streamingServer("You get 16 days [[1:1|Employees get 16 days.]] and 1,250 TL per diem. [[2:1|1,250 TL]] Invented: 99 days. [[1:2|99 days]]");
    const events: AnswerEvent[] = [];
    const { session: s, rpc } = session();
    const a = await answerQuestion(s, { question: "How many leave days?", persist: false }, (e) => events.push(e));

    const streamed = events.flatMap((e) => (e.type === "delta" ? [e.text] : [])).join("");
    expect(streamed).not.toContain("[[");
    expect(streamed).not.toContain("|");

    expect(a.model).toBe("local-answer");
    expect(a.promptVersion).toMatch(/-local$/);
    expect(a.costUsd).toBe(0);
    expect(a.abstained).toBe(false);
    expect(a.citationsInvalid).toBe(1);
    expect(a.text).toBe("You get 16 days and 1,250 TL per diem. Invented: 99 days.");
    expect(a.blocks.map((b) => b.status)).toEqual(["cited", "cited", "unverified"]);
    expect(a.sources.map((x) => x.chunkId)).toEqual(["c1", "c2"]);

    expect(bodies[0].tools).toBeUndefined();
    expect(bodies[0].model).toBe("local-answer");
    // Audit row: ids and flags only.
    const audit = rpc.mock.calls.find((c) => c[0] === "log_rag_query")![1];
    expect(audit).toMatchObject({ p_model: "local-answer", p_citations_invalid: 1, p_cited_chunk_ids: ["c1", "c2"] });
  });

  it("treats <abstain/> as an abstention and never streams the tag", async () => {
    streamingServer("<abstain/>");
    const events: AnswerEvent[] = [];
    const a = await answerQuestion(session().session, { question: "Board salary?", persist: false }, (e) => events.push(e));
    expect(a.abstained).toBe(true);
    expect(a.abstainReason).toBe("model");
    expect(events.some((e) => e.type === "delta" && e.text.includes("abstain"))).toBe(false);
  });

  it("never streams template-opened reasoning when LOCAL_LLM_REASONING is set", async () => {
    streamingServer("The user asks about leave, block 1 says 16.</think>You get 16 days. [[1:1|Employees get 16 days.]]", true);
    const events: AnswerEvent[] = [];
    const a = await answerQuestion(session().session, { question: "q", persist: false }, (e) => events.push(e));
    const streamed = events.flatMap((e) => (e.type === "delta" ? [e.text] : [])).join("");
    expect(streamed).toBe("You get 16 days.");
    expect(a.text).toBe("You get 16 days.");
    expect(a.blocks[0].status).toBe("cited");
  });

  it("flushes text that streaming held back, so Slack gets the whole answer", async () => {
    streamingServer("Per diem is 1,250 TL [[2:1|1,250 TL]] for a < b");
    const events: AnswerEvent[] = [];
    const a = await answerQuestion(session().session, { question: "q", persist: false }, (e) => events.push(e));
    expect(events.flatMap((e) => (e.type === "delta" ? [e.text] : [])).join("")).toBe(a.text);
  });

  it("abstains when the model writes only markers", async () => {
    streamingServer("<think>let me see</think>[[1:1|Employees get 16 days.]]");
    const a = await answerQuestion(session().session, { question: "q", persist: false });
    expect(a.abstainReason).toBe("model");
  });
});
