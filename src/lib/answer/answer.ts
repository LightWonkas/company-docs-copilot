import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, models, usageOf, type UsageCost } from "@/lib/llm/anthropic";
import { costUsd } from "@/lib/llm/pricing";
import { retrieve, type RetrievedChunk } from "@/lib/retrieval/retrieve";
import type { Turn } from "@/lib/retrieval/rewrite";
import type { UserSession } from "@/lib/retrieval/session";
import { foldTurkish } from "@/lib/text/fold";
import { abstentionText } from "./abstain";
import { ABSTAIN_TAG, isModelAbstention, validateAnswer, type AnswerBlock } from "./citations";
import { PROMPT_VERSION, buildAnswerRequest, toSearchResults, type SentSearchResult } from "./prompt";
import { queryHash, redactQuery } from "./redact";

export type Source = { chunkId: string; documentId: string; title: string };

export type FinalAnswer = {
  conversationId: string | null;
  messageId: string | null;
  text: string;
  blocks: AnswerBlock[];
  sources: Source[];
  abstained: boolean;
  abstainReason: "below_threshold" | "model" | "refusal" | null;
  citationsInvalid: number;
  model: string;
  promptVersion: string;
  latencyMs: number;
  costUsd: number;
  retrieval: { topScore: number; threshold: number; reranker: string; retrievedChunkIds: string[]; quarantined: number };
};

export type AnswerEvent =
  | { type: "status"; stage: "retrieving" | "generating" }
  | { type: "delta"; text: string }
  | { type: "final"; answer: FinalAnswer };

export type AnswerInput = {
  question: string;
  conversationId?: string | null;
  /** Evals set false: nothing is written to conversations/messages. */
  persist?: boolean;
  history?: Turn[];
};

function answerEffort(): "low" | "medium" | "high" {
  const e = process.env.ANSWER_EFFORT;
  return e === "low" || e === "high" ? e : "medium";
}

/** Without an API key: quote the best-matching sentences of the top chunk. */
function extractiveAnswer(question: string, sent: SentSearchResult[]): AnswerBlock[] {
  const terms = new Set(foldTurkish(question).split(/\W+/).filter((t) => t.length > 3));
  const top = sent[0];
  const scored = top.blocks
    .map((text, i) => ({ text, i, score: foldTurkish(text).split(/\W+/).filter((w) => terms.has(w)).length }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, 2)
    .sort((a, b) => a.i - b.i);
  return scored.map((b) => ({
    text: b.text,
    status: "cited" as const,
    citations: [{ chunkId: top.chunkId, documentId: top.documentId, title: top.title, citedText: b.text }],
  }));
}

export async function answerQuestion(
  session: UserSession,
  input: AnswerInput,
  emit: (event: AnswerEvent) => void = () => {},
): Promise<FinalAnswer> {
  const started = performance.now();
  const persist = input.persist ?? true;
  const db = session.client;

  let conversationId = input.conversationId ?? null;
  let history = input.history ?? [];
  if (persist && conversationId) {
    const { data } = await db
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(6);
    history = (data ?? []).reverse().map((m) => ({ role: m.role as Turn["role"], text: m.content }));
  }

  emit({ type: "status", stage: "retrieving" });
  const retrieval = await retrieve(session, input.question, { history });
  const lang = retrieval.query.lang;
  // Quarantined chunks (injection suspected at ingest) never reach the model.
  const context: RetrievedChunk[] = retrieval.results.filter((c) => !c.injectionSuspected);
  const permitted = new Set(retrieval.candidates.map((c) => c.chunkId));
  const sent = toSearchResults(context);

  let blocks: AnswerBlock[] = [];
  let abstainReason: FinalAnswer["abstainReason"] = null;
  let invalid = 0;
  let denied: string[] = [];
  let usage: UsageCost | null = null;
  const client = getAnthropic();
  const model = client ? models().answer : "offline-extractive";

  if (retrieval.belowThreshold || context.length === 0) {
    abstainReason = "below_threshold";
  } else if (!client) {
    blocks = extractiveAnswer(input.question, sent);
  } else {
    emit({ type: "status", stage: "generating" });
    const params = buildAnswerRequest({ model, question: retrieval.query.standalone_query, results: sent, history, effort: answerEffort() });
    const stream = client.beta.messages.stream(params);
    let buffered = "";
    stream.on("text", (delta) => {
      buffered += delta;
      // Hold back a possible "<abstain/>" so it never flashes in the UI.
      if (!ABSTAIN_TAG.startsWith(buffered.trimStart().slice(0, ABSTAIN_TAG.length))) {
        emit({ type: "delta", text: buffered });
        buffered = "";
      }
    });
    const message = await stream.finalMessage();
    usage = usageOf(message.usage as unknown as Anthropic.Usage);
    if (message.stop_reason === "refusal") {
      abstainReason = "refusal";
    } else {
      // Only text blocks carry answer text/citations (thinking and fallback
      // markers are skipped).
      const textBlocks = message.content.flatMap((b) =>
        b.type === "text" ? [{ type: "text", text: b.text, citations: b.citations as unknown as Record<string, unknown>[] | null }] : [],
      );
      const validation = validateAnswer(textBlocks, sent, permitted);
      invalid = validation.invalid;
      denied = validation.deniedChunkIds;
      if (isModelAbstention(validation.blocks)) abstainReason = "model";
      else blocks = validation.blocks;
    }
  }

  if (abstainReason) blocks = [{ text: abstentionText(input.question, lang), status: "plain", citations: [] }];

  const sources = new Map<string, Source>();
  for (const b of blocks) for (const c of b.citations) sources.set(c.chunkId, { chunkId: c.chunkId, documentId: c.documentId, title: c.title });
  const text = blocks.map((b) => b.text).join("");
  const latencyMs = Math.round(performance.now() - started);
  const cost = costUsd(model, usage);
  const retrievedChunkIds = retrieval.candidates.map((c) => c.chunkId);

  let messageId: string | null = null;
  if (persist) {
    if (!conversationId) {
      const { data: profile } = await db.from("profiles").select("org_id").eq("id", session.userId).single();
      const { data: conv } = await db
        .from("conversations")
        .insert({ org_id: profile!.org_id, title: input.question.slice(0, 80), channel: session.channel === "eval" ? "web" : session.channel })
        .select("id")
        .single();
      conversationId = conv?.id ?? null;
    } else {
      await db.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
    }
    if (conversationId) {
      await db.from("messages").insert({ conversation_id: conversationId, role: "user", content: input.question });
      const { data: saved } = await db
        .from("messages")
        .insert({
          conversation_id: conversationId,
          role: "assistant",
          content: text,
          blocks,
          cited_chunk_ids: [...sources.keys()],
          retrieved_chunk_ids: retrievedChunkIds,
          abstained: abstainReason !== null,
          abstain_reason: abstainReason,
          citations_invalid: invalid,
          prompt_version: PROMPT_VERSION,
          model,
          latency_ms: latencyMs,
          cost_usd: cost,
        })
        .select("id")
        .single();
      messageId = saved?.id ?? null;
    }
  }

  // Audit: ids, scores and flags only; the query is redacted and hashed.
  await db.rpc("log_rag_query", {
    p_channel: session.channel,
    p_query_redacted: redactQuery(input.question),
    p_query_hash: queryHash(input.question),
    p_retrieved_chunk_ids: retrievedChunkIds,
    p_cited_chunk_ids: [...sources.keys()],
    p_denied_chunk_ids: denied,
    p_model: model,
    p_prompt_version: PROMPT_VERSION,
    p_injection_flags: retrieval.results.filter((c) => c.injectionSuspected).map(() => "quarantined_chunk"),
    p_abstained: abstainReason !== null,
    p_citations_invalid: invalid,
    p_latency_ms: latencyMs,
    p_cost_usd: cost,
  });

  const answer: FinalAnswer = {
    conversationId,
    messageId,
    text,
    blocks,
    sources: [...sources.values()],
    abstained: abstainReason !== null,
    abstainReason,
    citationsInvalid: invalid,
    model,
    promptVersion: PROMPT_VERSION,
    latencyMs,
    costUsd: cost,
    retrieval: {
      topScore: retrieval.topScore,
      threshold: retrieval.threshold,
      reranker: retrieval.reranker,
      retrievedChunkIds,
      quarantined: retrieval.results.length - context.length,
    },
  };
  emit({ type: "final", answer });
  return answer;
}
