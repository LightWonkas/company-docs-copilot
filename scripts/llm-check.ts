// Live check of every Claude call shape the app uses (costs a few cents):
// helper structured output (Haiku), cited streaming answer (Sonnet) and the
// judge (Opus). Prints shapes and usage, never the API key.   pnpm llm:check
import { loadEnv } from "./lib/local";

loadEnv();
const { getAnthropic, models, structuredCall } = await import("../src/lib/llm/anthropic");
const { RewrittenQuery } = await import("../src/lib/retrieval/rewrite");
const { buildAnswerRequest } = await import("../src/lib/answer/prompt");
const { validateAnswer } = await import("../src/lib/answer/citations");
const { judgeFaithfulness } = await import("../evals/lib/judge");

const client = getAnthropic();
if (!client) throw new Error("ANTHROPIC_API_KEY is not set");
const m = models();

const t0 = performance.now();
const { data: rewrite, usage: ru } = await structuredCall({
  client,
  model: m.helper,
  schema: RewrittenQuery,
  system: "Rewrite the question. Return lang, standalone_query, query_tr, query_en.",
  user: "<question>Yıllık izin hakkım kaç gün?</question>",
});
console.log(`helper (${m.helper}) ok in ${Math.round(performance.now() - t0)} ms:`, rewrite, ru);

const sent = [
  {
    source: "kb://doc-1#chunk-1",
    chunkId: "chunk-1",
    documentId: "doc-1",
    title: "Yıllık İzin Politikası",
    blocks: ["Kıdemi 1-5 yıl olan çalışanlar yılda 16 iş günü izin kullanır.", "15 yıl ve üzeri kıdemde izin 28 iş günüdür."],
  },
];
const t1 = performance.now();
const stream = client.beta.messages.stream(
  buildAnswerRequest({ model: m.answer, question: "Yıllık izin hakkım kaç gün? 3 yıldır çalışıyorum.", results: sent, history: [], effort: "medium" }),
);
let deltas = 0;
stream.on("text", () => deltas++);
const message = await stream.finalMessage();
const texts = message.content.flatMap((b) =>
  b.type === "text" ? [{ type: "text", text: b.text, citations: b.citations as unknown as Record<string, unknown>[] | null }] : [],
);
const v = validateAnswer(texts, sent, new Set(["chunk-1"]));
console.log(`answer (${message.model}) ok in ${Math.round(performance.now() - t1)} ms, ${deltas} deltas, stop=${message.stop_reason}`);
console.log("  blocks:", v.blocks.map((b) => `${b.status}:${JSON.stringify(b.text.slice(0, 80))}`));
console.log("  invalid citations:", v.invalid, "| raw citation sample:", JSON.stringify(texts.find((t) => t.citations?.length)?.citations?.[0] ?? null));
console.log("  usage:", message.usage);

const t2 = performance.now();
const verdict = await judgeFaithfulness(client, m.judge, v.blocks.map((b) => b.text).join(""), sent[0].blocks);
console.log(`judge (${m.judge}) ok in ${Math.round(performance.now() - t2)} ms:`, verdict);
