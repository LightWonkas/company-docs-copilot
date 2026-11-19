// Calibrates the abstention threshold for the active reranker:
// threshold = 5th percentile of top-1 scores on ANSWERABLE golden items, so at
// most ~5% of answerable questions are wrongly abstained; reports how many
// unanswerable items that threshold catches. Re-run whenever the embedder or
// reranker changes.   pnpm eval:calibrate
import { writeFileSync } from "node:fs";
import { loadEnv } from "../scripts/lib/local";
import { readJsonl, type GoldenItem } from "./lib/data";
import { percentile, wilson } from "./lib/metrics";
import { personaSession } from "./lib/personas";

loadEnv();
const { retrieve } = await import("@/lib/retrieval/retrieve");
const { ABSTAIN_THRESHOLDS } = await import("@/lib/retrieval/config");

const golden = readJsonl<GoldenItem>("evals/golden/v1.jsonl");
const answerable: number[] = [];
const unanswerable: number[] = [];
let reranker = "";
const sessions = new Map<string, Awaited<ReturnType<typeof personaSession>>>();

for (const item of golden) {
  if (!sessions.has(item.persona)) sessions.set(item.persona, await personaSession(item.persona));
  const r = await retrieve(sessions.get(item.persona)!, item.question);
  reranker = r.reranker;
  (item.answerable ? answerable : unanswerable).push(r.topScore);
}

const threshold = Number(percentile(answerable, 0.05).toFixed(3));
const falseAbstain = answerable.filter((s) => s < threshold).length;
const trueAbstain = unanswerable.filter((s) => s < threshold).length;
const summary = {
  reranker,
  current: ABSTAIN_THRESHOLDS[reranker],
  recommended: threshold,
  answerable: { n: answerable.length, p05: percentile(answerable, 0.05), median: percentile(answerable, 0.5) },
  unanswerable: { n: unanswerable.length, median: percentile(unanswerable, 0.5), p95: percentile(unanswerable, 0.95) },
  falseAbstention: wilson(falseAbstain, answerable.length),
  trueAbstention: wilson(trueAbstain, unanswerable.length),
  calibratedAt: new Date().toISOString(),
};
writeFileSync(`evals/results/calibration-${reranker}.json`, JSON.stringify({ ...summary, answerableScores: answerable, unanswerableScores: unanswerable }, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log(`\nSet ABSTAIN_THRESHOLDS["${reranker}"] = ${threshold} in src/lib/retrieval/config.ts`);
