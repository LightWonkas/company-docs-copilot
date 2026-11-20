// Pipeline ablation (retrieval only) on the CURRENT ingested corpus:
//   none        no LLM rewrite, fused order (cosine score)
//   rewrite     + Haiku query rewrite (TR/EN translation, standalone query)
//   rewrite+rerank  + Haiku listwise rerank
// Run once on a corpus ingested without a key (no contexts) and once with
// contexts to isolate Contextual Retrieval.   pnpm eval:ablate:pipeline <label>
import { writeFileSync } from "node:fs";
import { loadEnv, serviceClient } from "../scripts/lib/local";
import { goldChunkIds, loadCorpusIndex, readJsonl, type GoldenItem } from "./lib/data";
import { meanCi, mrrAtK, recallAtK } from "./lib/metrics";
import { personaSession } from "./lib/personas";

loadEnv();
const { retrieve } = await import("@/lib/retrieval/retrieve");
const { FusionOnlyReranker, HaikuListwiseReranker } = await import("@/lib/retrieval/rerank");
const { getAnthropic, models } = await import("@/lib/llm/anthropic");

const label = process.argv[2] ?? "current";
const client = getAnthropic();
const index = await loadCorpusIndex(serviceClient());
const { count: contextCount } = await serviceClient().from("chunks").select("id", { count: "exact", head: true }).not("context", "is", null);
const golden = readJsonl<GoldenItem>("evals/golden/v1.jsonl").filter((g) => g.answerable);

const configs = [
  { name: "none", llmRewrite: false, reranker: () => new FusionOnlyReranker() },
  ...(client
    ? [
        { name: "rewrite", llmRewrite: true, reranker: () => new FusionOnlyReranker() },
        { name: "rewrite+rerank", llmRewrite: true, reranker: () => new HaikuListwiseReranker({ client, model: models().helper }) },
      ]
    : []),
];

const out: Record<string, unknown> = { label, contextualizedChunks: contextCount ?? 0, createdAt: new Date().toISOString() };
for (const cfg of configs) {
  const rows: { lang: string; category: string; r5: number; r20: number; mrr: number }[] = [];
  for (const item of golden) {
    const r = await retrieve(await personaSession(item.persona), item.question, { llmRewrite: cfg.llmRewrite, reranker: cfg.reranker() });
    const ranked = r.ranked.map((c) => c.chunkId);
    const gold = goldChunkIds(item, index);
    if (gold.size === 0) continue;
    rows.push({ lang: item.lang, category: item.category, r5: recallAtK(ranked, gold, 5), r20: recallAtK(ranked, gold, 20), mrr: mrrAtK(ranked, gold, 10) });
  }
  const sum = (xs: typeof rows) => ({ n: xs.length, recall5: meanCi(xs.map((x) => x.r5)), recall20: meanCi(xs.map((x) => x.r20)), mrr10: meanCi(xs.map((x) => x.mrr)) });
  out[cfg.name] = {
    all: sum(rows),
    tr: sum(rows.filter((r) => r.lang === "tr")),
    en: sum(rows.filter((r) => r.lang === "en")),
    crossLingual: sum(rows.filter((r) => r.category === "cross_lingual")),
    noDiacritics: sum(rows.filter((r) => r.category === "no_diacritics")),
  };
  const a = (out[cfg.name] as { all: ReturnType<typeof sum> }).all;
  console.log(`${label} / ${cfg.name}: R@5 ${a.recall5.mean.toFixed(3)} R@20 ${a.recall20.mean.toFixed(3)} MRR ${a.mrr10.mean.toFixed(3)} (n=${a.n})`);
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
writeFileSync(`evals/results/${stamp}-ablation-pipeline-${label}.json`, JSON.stringify(out, null, 2));
