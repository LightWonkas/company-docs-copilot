import type Anthropic from "@anthropic-ai/sdk";
import { CohereReranker, FusionOnlyReranker, HaikuListwiseReranker, VoyageReranker, type Reranker } from "./rerank";

export const RETRIEVAL = {
  /** RRF constant (k in 1 / (k + rank)). */
  rrfK: Number(process.env.RRF_K ?? 60),
  /** Candidates per leg; ~3x the fused list that reaches the reranker. */
  candidatesPerLeg: 75,
  /** Fused candidates sent to the reranker (spec: 20-30). */
  rerankTopN: 25,
  /** Chunks passed on to the answer model. */
  finalTopK: 8,
} as const;

/**
 * Top-1 rerank score below which the assistant abstains without calling the
 * answer model. Calibrated per reranker on the golden set (calibrate-abstention
 * skill / `pnpm eval:calibrate`), targeting <= 5% false abstention.
 * ABSTAIN_THRESHOLD overrides for experiments.
 */
export const ABSTAIN_THRESHOLDS: Record<string, number> = {
  "haiku-listwise": 0.4,
  voyage: 0.3,
  cohere: 0.3,
  none: 0.8,
};

export function abstainThreshold(rerankerId: string): number {
  const override = process.env.ABSTAIN_THRESHOLD;
  if (override) return Number(override);
  return ABSTAIN_THRESHOLDS[rerankerId] ?? 0.5;
}

export function selectReranker(llm: { client: Anthropic; model: string } | null): Reranker {
  const choice = process.env.RERANKER ?? (llm ? "haiku-listwise" : "none");
  if (choice === "voyage" && process.env.VOYAGE_API_KEY) return new VoyageReranker(process.env.VOYAGE_API_KEY);
  if (choice === "cohere" && process.env.COHERE_API_KEY) {
    return new CohereReranker(process.env.COHERE_API_KEY, process.env.COHERE_RERANK_MODEL ?? "rerank-v4.0");
  }
  if (choice === "haiku-listwise" && llm) return new HaikuListwiseReranker(llm);
  return new FusionOnlyReranker();
}
