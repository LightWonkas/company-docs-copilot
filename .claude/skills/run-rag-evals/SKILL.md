---
name: run-rag-evals
description: Use when asked to evaluate quality, after changing chunking, embeddings, retrieval, reranking or the answer prompt, or before claiming such a change helped. Runs the smoke or full eval, diffs against the previous run, reports metrics with confidence intervals, explains regressions and applies the CI gates.
---

# Run RAG evals

Requires the seeded local stack (`pnpm db:start && pnpm env:local && pnpm seed`).

## 1. Pick the suite

- `pnpm eval:smoke`: 50 golden items, permission suite for 4 personas, injection suite. Use this for PR-sized changes.
- `pnpm eval`: full 205-item golden set, all 11 personas × 60 attacks, injection suite. Use it before merging retrieval or prompt changes, and nightly.

Without `ANTHROPIC_API_KEY` the harness runs in **offline-extractive** mode:

- Retrieval, abstention-by-threshold, citation plumbing, permission and injection checks are real.
- The judge metrics (faithfulness, correctness) are reported as "not run".
- Say so explicitly in your summary.

## 2. Read the results

The harness prints a table and writes `evals/results/<timestamp>-<suite>.json`; the README table is updated between the `EVAL:<suite>` markers. Report:

- Retrieval: recall@5/@20, MRR@10, nDCG@10, all/TR/EN, with CIs.
- Abstention: true and false rates with Wilson CIs.
- Citations: validity (must be 100%), precision and coverage.
- Permission leaks as `k/n`. When `k = 0`, give the rule-of-three upper bound: "0/660, 95% upper bound 0.45%".
- Injection ASR by attack category.

## 3. Signal vs noise

A change is real only if the CIs of the two runs don't overlap substantially, or the per-item diff is consistent. Compare per-item rows in the JSON (`items[]`) to see which items flipped. Small-n slices (TR only, a single category) are usually noise: say so rather than over-claiming.

## 4. Gates (CI fails if any trips)

- permission leaks > 0
- injection ASR > 0
- citation validity < 100%
- faithfulness drop > 3 points vs the previous run

Never "fix" a gate by editing the golden set or the thresholds in `evals/run.ts`. Investigate with the `retrieval-debugger` agent instead.
