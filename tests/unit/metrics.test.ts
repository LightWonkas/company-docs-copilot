import { describe, expect, it } from "vitest";
import { cohensKappa, meanCi, mrrAtK, ndcgAtK, percentile, recallAtK, ruleOfThree, wilson } from "../../evals/lib/metrics";

const rel = new Set(["b", "d"]);

describe("ranking metrics", () => {
  it("recall@k", () => {
    expect(recallAtK(["a", "b", "c", "d"], rel, 2)).toBe(0.5);
    expect(recallAtK(["a", "b", "c", "d"], rel, 4)).toBe(1);
    expect(recallAtK(["a"], new Set(), 5)).toBe(0);
  });

  it("MRR@k", () => {
    expect(mrrAtK(["a", "b"], rel, 10)).toBe(0.5);
    expect(mrrAtK(["a", "c"], rel, 10)).toBe(0);
    expect(mrrAtK(["a", "c", "b"], rel, 2)).toBe(0);
  });

  it("nDCG@k matches a hand computation", () => {
    // relevant at ranks 2 and 4: (1/log2 3 + 1/log2 5) / (1 + 1/log2 3)
    const expected = (1 / Math.log2(3) + 1 / Math.log2(5)) / (1 + 1 / Math.log2(3));
    expect(ndcgAtK(["a", "b", "c", "d"], rel, 10)).toBeCloseTo(expected, 10);
    expect(ndcgAtK(["b", "d"], rel, 10)).toBe(1);
  });
});

describe("intervals", () => {
  it("Wilson interval matches reference values", () => {
    const w = wilson(8, 10);
    expect(w.low).toBeCloseTo(0.4902, 3);
    expect(w.high).toBeCloseTo(0.9433, 3);
    expect(wilson(0, 50).low).toBe(0);
  });

  it("rule of three gives 3/n for zero events", () => {
    expect(ruleOfThree(300)).toBe(0.01);
  });

  it("meanCi", () => {
    expect(meanCi([1, 1, 1]).low).toBe(1);
    expect(meanCi([0, 1]).mean).toBe(0.5);
  });

  it("percentile interpolates", () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentile([0, 10], 0.05)).toBeCloseTo(0.5);
  });
});

describe("Cohen's kappa", () => {
  it("is 1 for perfect agreement and 0 for chance-level", () => {
    expect(cohensKappa(["y", "n", "y"], ["y", "n", "y"])).toBe(1);
    expect(cohensKappa(["y", "y", "n", "n"], ["y", "n", "y", "n"])).toBe(0);
  });

  it("matches a textbook example", () => {
    // 20 yes/yes, 5 yes/no, 10 no/yes, 15 no/no -> kappa = 0.4
    const a = [...Array(20).fill("y"), ...Array(5).fill("y"), ...Array(10).fill("n"), ...Array(15).fill("n")];
    const b = [...Array(20).fill("y"), ...Array(5).fill("n"), ...Array(10).fill("y"), ...Array(15).fill("n")];
    expect(cohensKappa(a, b)).toBeCloseTo(0.4, 10);
  });
});
