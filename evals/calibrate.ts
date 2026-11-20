// Calibrates the abstention threshold for the active reranker: among the
// midpoints between observed top-1 scores, pick the one that abstains on the
// most UNANSWERABLE items while wrongly abstaining on <= 5% of ANSWERABLE ones
// (ties: fewest false abstentions). Re-run whenever the embedder or
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

for (const item of golden) {
  const r = await retrieve(await personaSession(item.persona), item.question);
  reranker = r.reranker;
  (item.answerable ? answerable : unanswerable).push(r.topScore);
}

const sorted = [...new Set([...answerable, ...unanswerable])].sort((a, b) => a - b);
const candidates = sorted.slice(1).map((s, i) => (s + sorted[i]) / 2);
let best = { t: percentile(answerable, 0.05), fa: Infinity, ta: -1 };
for (const t of candidates) {
  const fa = answerable.filter((s) => s < t).length;
  const ta = unanswerable.filter((s) => s < t).length;
  if (fa / answerable.length > 0.05) continue;
  if (ta > best.ta || (ta === best.ta && fa < best.fa)) best = { t, fa, ta };
}
const threshold = Number(best.t.toFixed(3));
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
