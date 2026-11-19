// Embedder ablation (dense retrieval only, offline): e5-small vs e5-base vs
// bge-m3 on the answerable golden items, each persona searching only the
// chunks RLS lets them read. Chunk vectors for non-default models are computed
// in memory (the DB stores only the default 384-d e5-small vectors).
//   pnpm eval:ablate [e5-small e5-base bge-m3]
import { writeFileSync } from "node:fs";
import { loadEnv, serviceClient } from "../scripts/lib/local";
import { goldChunkIds, loadCorpusIndex, readJsonl, type GoldenItem } from "./lib/data";
import { meanCi, mrrAtK, recallAtK } from "./lib/metrics";
import { permittedChunks, personaSession } from "./lib/personas";

loadEnv();
const { EMBEDDING_MODELS, getEmbedder } = await import("@/lib/embeddings/embedder");
const { embeddingInput } = await import("@/lib/ingest/pipeline");
type ModelId = keyof typeof EMBEDDING_MODELS;

const requested = process.argv.slice(2).filter((a) => a in EMBEDDING_MODELS) as ModelId[];
const modelIds: ModelId[] = requested.length ? requested : ["e5-small", "e5-base", "bge-m3"];

const db = serviceClient();
const index = await loadCorpusIndex(db);
const { data: chunks } = await db.from("chunks").select("id, heading_path, context, text").eq("kind", "chunk");
const golden = readJsonl<GoldenItem>("evals/golden/v1.jsonl").filter((g) => g.answerable);

const allowed = new Map<string, Set<string>>();
for (const key of new Set(golden.map((g) => g.persona))) {
  allowed.set(key, (await permittedChunks(await personaSession(key))).chunkIds);
}

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
const results: Record<string, unknown> = {};

for (const id of modelIds) {
  const t0 = performance.now();
  const embedder = getEmbedder(id);
  const vectors = await embedder.embedPassages((chunks ?? []).map((c) => embeddingInput(c.heading_path, c.context, c.text)));
  const byId = new Map((chunks ?? []).map((c, i) => [c.id, vectors[i]]));
  const queries = await embedder.embedQueries(golden.map((g) => g.question));

  const per = golden.map((item, i) => {
    const visible = allowed.get(item.persona)!;
    const ranked = [...visible]
      .filter((cid) => byId.has(cid))
      .map((cid) => ({ cid, s: dot(queries[i], byId.get(cid)!) }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.cid);
    const gold = goldChunkIds(item, index);
    return { lang: item.lang, r5: recallAtK(ranked, gold, 5), r20: recallAtK(ranked, gold, 20), mrr: mrrAtK(ranked, gold, 10) };
  });
  const summarise = (rows: typeof per) => ({
    n: rows.length,
    recall5: meanCi(rows.map((r) => r.r5)),
    recall20: meanCi(rows.map((r) => r.r20)),
    mrr10: meanCi(rows.map((r) => r.mrr)),
  });
  results[id] = {
    dims: embedder.dims,
    seconds: Math.round((performance.now() - t0) / 1000),
    all: summarise(per),
    tr: summarise(per.filter((r) => r.lang === "tr")),
    en: summarise(per.filter((r) => r.lang === "en")),
  };
  console.log(id, JSON.stringify(results[id]));
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
writeFileSync(`evals/results/${stamp}-ablation-embedders.json`, JSON.stringify(results, null, 2));
