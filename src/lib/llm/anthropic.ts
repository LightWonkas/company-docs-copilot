import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { getServerEnv } from "@/lib/env";

/**
 * Raw Anthropic SDK client. Returns null when no API key is configured so
 * callers can fall back to deterministic behaviour (and tests run offline).
 */
let client: Anthropic | null | undefined;

export function getAnthropic(): Anthropic | null {
  if (client === undefined) {
    const { ANTHROPIC_API_KEY } = getServerEnv();
    client = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: 3 }) : null;
  }
  return client;
}

/** For tests: inject a fake client. */
export function setAnthropicForTesting(fake: Anthropic | null | undefined) {
  client = fake;
}

/** Anthropic model ids; answers and helpers go through lib/llm/provider.ts, the judge uses `judge`. */
export function models() {
  const env = getServerEnv();
  return { answer: env.ANSWER_MODEL, helper: env.HELPER_MODEL, judge: env.JUDGE_MODEL };
}

export type UsageCost = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };

/**
 * Anthropic side of `structuredCall` (lib/llm/provider.ts): helper-model call with a JSON schema enforced by the API (structured
 * outputs via output_config.format), parsed and re-validated with Zod.
 * Never uses forced tool_choice to get JSON.
 */
export async function anthropicStructuredCall<T extends z.ZodType>(args: {
  client: Anthropic;
  model: string;
  schema: T;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<{ data: z.infer<T>; usage: UsageCost }> {
  const message = await args.client.messages.parse({
    model: args.model,
    max_tokens: args.maxTokens ?? 512,
    system: args.system,
    messages: [{ role: "user", content: args.user }],
    // Short classification/rewrite calls: low effort instead of disabling
    // thinking, because {type: "disabled"} is a 400 on Sonnet 5.5 / Opus 5.5
    // and the helper model is configurable.
    output_config: { format: zodOutputFormat(args.schema), effort: "low" },
  });
  const data = args.schema.parse(message.parsed_output);
  return { data, usage: usageOf(message.usage) };
}

export function usageOf(usage: Anthropic.Usage): UsageCost {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  };
}
