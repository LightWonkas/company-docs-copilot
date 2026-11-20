---
name: calibrate-abstention
description: Use after changing the embedder, the reranker, chunking or contextual retrieval, or when false/true abstention rates look wrong. Recomputes the reranker top-1 score threshold below which the assistant abstains without calling the answer model, targeting <= 5% false abstention.
---

# Calibrate abstention

The threshold is per reranker id: `ABSTAIN_THRESHOLDS` in `src/lib/retrieval/config.ts`. Each reranker has its own score scale; for the fusion-only reranker the score is cosine similarity.

1. Make sure the corpus is ingested with the current pipeline (`pnpm seed`). Set the reranker you are calibrating with `RERANKER=llm-listwise|voyage|cohere|none` (`llm-listwise` is Haiku, or `local-listwise-<model>` with `LLM_PROVIDER=openai-compatible`).
2. Run `pnpm eval:calibrate`. It runs retrieval for all 205 golden items, each as its persona. It then picks the threshold that abstains on the most unanswerable items while keeping false abstention on answerable items at or below 5%. Both rates come with Wilson CIs.
3. Update the threshold in `config.ts` with a dated comment giving both rates.
4. Run `pnpm eval:smoke` and confirm false abstention is about 5% and nothing else regressed.

## Interpreting

If the unanswerable median sits close to the answerable p05, the score does not separate "answer exists" from "nothing relevant". Example: cosine similarity with e5 gave 40% true abstention at a 5.9% false-abstention rate.

In that case do not raise the threshold, because that trades directly into false abstentions. Report it instead. Layer (b), the model's `<abstain/>`, has to carry the rest, and a better reranker (Haiku listwise) is the fix.
