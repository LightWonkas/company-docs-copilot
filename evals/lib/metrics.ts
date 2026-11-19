// Deterministic evaluation metrics. Pure functions, unit-tested.

/** Fraction of relevant ids found in the top k of the ranking. */
export function recallAtK(ranked: string[], relevant: Set<string>, k: number): number {
  if (relevant.size === 0) return 0;
  const top = new Set(ranked.slice(0, k));
  let hit = 0;
  for (const r of relevant) if (top.has(r)) hit++;
  return hit / relevant.size;
}

/** Reciprocal rank of the first relevant id within the top k (0 if none). */
export function mrrAtK(ranked: string[], relevant: Set<string>, k: number): number {
  const i = ranked.slice(0, k).findIndex((id) => relevant.has(id));
  return i < 0 ? 0 : 1 / (i + 1);
}

/** Binary-relevance nDCG@k. */
export function ndcgAtK(ranked: string[], relevant: Set<string>, k: number): number {
  const dcg = ranked.slice(0, k).reduce((sum, id, i) => sum + (relevant.has(id) ? 1 / Math.log2(i + 2) : 0), 0);
  const ideal = Array.from({ length: Math.min(relevant.size, k) }, (_, i) => 1 / Math.log2(i + 2)).reduce((a, b) => a + b, 0);
  return ideal === 0 ? 0 : dcg / ideal;
}

/** Ranked ids with duplicates removed (doc-level rankings from chunk rankings). */
export function dedupe(ids: string[]): string[] {
  return [...new Set(ids)];
}

export type Rate = { k: number; n: number; rate: number; low: number; high: number };

/** 95% Wilson score interval for k successes in n trials. */
export function wilson(k: number, n: number, z = 1.96): Rate {
  if (n === 0) return { k, n, rate: 0, low: 0, high: 0 };
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { k, n, rate: p, low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

/**
 * Rule of three: with 0 events in n independent trials, the 95% upper bound
 * on the true rate is ~3/n. Used to report "0 leaks" honestly.
 */
export function ruleOfThree(n: number): number {
  return n === 0 ? 1 : Math.min(1, 3 / n);
}

/** Cohen's kappa for two raters over the same items (any label set). */
export function cohensKappa(a: string[], b: string[]): number {
  if (a.length !== b.length || a.length === 0) throw new Error("kappa needs two equal, non-empty label lists");
  const n = a.length;
  const labels = [...new Set([...a, ...b])];
  const observed = a.filter((x, i) => x === b[i]).length / n;
  const expected = labels.reduce((sum, l) => sum + (a.filter((x) => x === l).length / n) * (b.filter((x) => x === l).length / n), 0);
  return expected === 1 ? 1 : (observed - expected) / (1 - expected);
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Normal-approximation 95% CI for a mean of per-item scores (recall, MRR...). */
export function meanCi(xs: number[]): { mean: number; low: number; high: number; n: number } {
  const m = mean(xs);
  if (xs.length < 2) return { mean: m, low: m, high: m, n: xs.length };
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
  const half = (1.96 * sd) / Math.sqrt(xs.length);
  return { mean: m, low: Math.max(0, m - half), high: Math.min(1, m + half), n: xs.length };
}

export function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
