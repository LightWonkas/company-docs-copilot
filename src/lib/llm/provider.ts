import type Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { getServerEnv, type ServerEnv } from "@/lib/env";
import { anthropicStructuredCall, getAnthropic, type UsageCost } from "./anthropic";
import { LocalLlmClient, localStructuredCall } from "./local";

/**
 * One switch for every model call outside the eval judge: LLM_PROVIDER picks
 * Anthropic (default) or a company-hosted OpenAI-compatible model. Callers get
 * a client plus model ids and never branch on env themselves.
 */
export type LlmClient = Anthropic | LocalLlmClient;
export type HelperLlm = { client: LlmClient; model: string };
export type LlmSelection = {
  provider: ServerEnv["LLM_PROVIDER"];
  client: LlmClient;
  models: { answer: string; helper: string };
};

export function isLocalClient(client: LlmClient): client is LocalLlmClient {
  return client instanceof LocalLlmClient;
}

/**
 * Pure selection from parsed env (unit-tested). Returns null when no model is
 * configured, which is the offline mode: heuristic rewrite, fusion-only
 * rerank, pattern-only screen and extractive answers.
 */
export function resolveLlm(env: ServerEnv, anthropic: () => Anthropic | null = getAnthropic): LlmSelection | null {
  if (env.LLM_PROVIDER === "openai-compatible") {
    // env.ts refuses this provider without both values; re-checked for the type.
    if (!env.LOCAL_LLM_BASE_URL || !env.LOCAL_LLM_MODEL) return null;
    return {
      provider: "openai-compatible",
      client: new LocalLlmClient({ baseUrl: env.LOCAL_LLM_BASE_URL, apiKey: env.LOCAL_LLM_API_KEY, timeoutMs: env.LOCAL_LLM_TIMEOUT_MS }),
      models: { answer: env.LOCAL_LLM_MODEL, helper: env.LOCAL_LLM_HELPER_MODEL ?? env.LOCAL_LLM_MODEL },
    };
  }
  const client = anthropic();
  return client ? { provider: "anthropic", client, models: { answer: env.ANSWER_MODEL, helper: env.HELPER_MODEL } } : null;
}

let selection: LlmSelection | null | undefined;

export function getLlm(): LlmSelection | null {
  if (selection === undefined) selection = resolveLlm(getServerEnv());
  return selection;
}

/** For tests: inject a selection (undefined re-reads env). */
export function setLlmForTesting(fake: LlmSelection | null | undefined) {
  selection = fake;
}

/** Client + helper model for rewrite, rerank, injection screen and contextualization. */
export function getHelperLlm(): HelperLlm | null {
  const llm = getLlm();
  return llm ? { client: llm.client, model: llm.models.helper } : null;
}

/** Schema-constrained helper call on either provider, always re-validated with Zod. */
export async function structuredCall<T extends z.ZodType>(args: {
  client: LlmClient;
  model: string;
  schema: T;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<{ data: z.infer<T>; usage: UsageCost }> {
  const { client, ...rest } = args;
  return isLocalClient(client) ? localStructuredCall({ client, ...rest }) : anthropicStructuredCall({ client, ...rest });
}
