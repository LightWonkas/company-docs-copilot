import type { UsageCost } from "./anthropic";

// USD per million tokens (Anthropic first-party rates, checked 2026-11-20 via
// the claude-api reference). Cache writes are assumed at 1.25x input for the
// default 5-minute TTL. Haiku 5.5 prices apply to prompts <= 100K tokens.
const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};

export function costUsd(model: string, usage: UsageCost | null): number {
  const p = PRICES[model];
  if (!p || !usage) return 0;
  return (
    (usage.inputTokens * p.input +
      usage.outputTokens * p.output +
      usage.cacheReadTokens * p.cacheRead +
      usage.cacheWriteTokens * p.cacheWrite) /
    1_000_000
  );
}
