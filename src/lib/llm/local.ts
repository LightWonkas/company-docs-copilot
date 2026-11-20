import { z } from "zod";
import type { UsageCost } from "./anthropic";

/**
 * Minimal client for a company-hosted model behind an OpenAI-compatible
 * `/chat/completions` endpoint (Ollama, vLLM, LM Studio). Plain fetch on
 * purpose: one endpoint, two call shapes, no SDK to pin and audit.
 *
 * Requests built here never carry `tools`, `tool_choice` or `functions`:
 * every prompt contains untrusted document text, so the model can only write.
 */
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  temperature: number;
  response_format?: { type: "json_schema"; json_schema: { name: string; schema: Record<string, unknown>; strict: boolean } };
  stream?: boolean;
  stream_options?: { include_usage: boolean };
};

type ChatUsage = { prompt_tokens?: number; completion_tokens?: number } | null | undefined;

const ChatResponse = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable().optional() }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
  usage: z.object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional() }).nullish(),
});

export type StreamResult = { text: string; usage: UsageCost; finishReason: string | null };

/**
 * Chat-template control tokens (ChatML, Llama 3, Mistral, Gemma). Servers that
 * render the template as text (llama.cpp/Ollama, vLLM) may parse these as real
 * special tokens, so a document containing "<|im_start|>system" could open
 * its own system turn. Anthropic's API has no such channel.
 */
export function neutralizeControlTokens(text: string): string {
  return text
    .replace(/<\|/g, "‹|")
    .replace(/\|>/g, "|›")
    .replace(/\[(\/?INST)\]/gi, "[ $1]")
    .replace(/<(\/?s|start_of_turn|end_of_turn)>/gi, "‹$1>");
}

export class LocalLlmClient {
  readonly provider = "openai-compatible";
  /** The model writes reasoning before "</think>" in its content (template-opened <think>). */
  readonly reasoning: boolean;
  private readonly endpoint: string;

  constructor(
    private readonly opts: { baseUrl: string; apiKey?: string; timeoutMs: number; reasoning?: boolean; fetch?: typeof fetch },
  ) {
    this.endpoint = `${opts.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    this.reasoning = opts.reasoning ?? false;
  }

  private async post(body: ChatRequest): Promise<Response> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.opts.apiKey) headers.authorization = `Bearer ${this.opts.apiKey}`;
    // Every non-system message carries untrusted text (documents, questions, history).
    const messages = body.messages.map((m) => (m.role === "system" ? m : { ...m, content: neutralizeControlTokens(m.content) }));
    const res = await (this.opts.fetch ?? fetch)(this.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, messages }),
      signal: AbortSignal.timeout(this.opts.timeoutMs),
    });
    // Status only: an error body may echo the prompt, i.e. document text.
    if (!res.ok) throw new Error(`local llm ${res.status}`);
    return res;
  }

  async chat(body: ChatRequest): Promise<{ text: string; usage: UsageCost; finishReason: string | null }> {
    const res = await this.post({ ...body, stream: false });
    const parsed = ChatResponse.parse(await res.json());
    const choice = parsed.choices[0];
    return { text: choice.message.content ?? "", usage: localUsage(parsed.usage), finishReason: choice.finish_reason ?? null };
  }

  /** Server-sent events; `onText` gets each content delta as it arrives. */
  async stream(body: ChatRequest, onText: (delta: string) => void): Promise<StreamResult> {
    const res = await this.post({ ...body, stream: true, stream_options: { include_usage: true } });
    if (!res.body) throw new Error("local llm: empty stream");
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let pending = "";
    let text = "";
    let usage: ChatUsage;
    let finishReason: string | null = null;
    const handle = (line: string) => {
      const data = line.startsWith("data:") ? line.slice(5).trim() : null;
      if (!data || data === "[DONE]") return;
      const chunk = JSON.parse(data) as {
        choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
        usage?: ChatUsage;
      };
      const choice = chunk.choices?.[0];
      const delta = choice?.delta?.content;
      if (delta) {
        text += delta;
        onText(delta);
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      if (chunk.usage) usage = chunk.usage;
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += value;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) handle(line);
    }
    handle(pending);
    return { text, usage: localUsage(usage), finishReason };
  }
}

export function localUsage(usage: ChatUsage): UsageCost {
  return {
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
}

/**
 * Reasoning models served through Ollama/vLLM (DeepSeek-R1, Qwen3) may put
 * their chain of thought inline in `content`. It is never part of the answer.
 */
export function stripReasoning(text: string): string {
  // A chat template may open <think> in the prompt, so only the close shows up.
  const unopened = !text.includes("<think>") && text.includes("</think>");
  const body = unopened ? text.slice(text.indexOf("</think>") + "</think>".length) : text;
  return body.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trimStart();
}

/** JSON from a model that may wrap it in a code fence despite the schema. */
export function parseJsonContent(text: string): unknown {
  const body = stripReasoning(text).trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(body);
  return JSON.parse(fenced ? fenced[1] : body);
}

/**
 * Helper call with a JSON schema: sent as `response_format` (OpenAI / vLLM /
 * LM Studio / Ollama >= 0.5 grammar-constrain on it) and repeated in the
 * system prompt for servers that ignore it. The reply is always re-validated
 * with the same Zod schema as the Anthropic path, so a non-conforming model
 * throws and each caller's fallback applies (the injection screen fails closed).
 */
export async function localStructuredCall<T extends z.ZodType>(args: {
  client: LocalLlmClient;
  model: string;
  schema: T;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<{ data: z.infer<T>; usage: UsageCost }> {
  const schema = z.toJSONSchema(args.schema, { target: "draft-7" }) as Record<string, unknown>;
  delete schema.$schema;
  const { text, usage } = await args.client.chat(localStructuredRequest({ ...args, schema }));
  return { data: args.schema.parse(parseJsonContent(text)), usage };
}

export function localStructuredRequest(args: {
  model: string;
  schema: Record<string, unknown>;
  system: string;
  user: string;
  maxTokens?: number;
}): ChatRequest {
  return {
    model: args.model,
    // Local models are slower and reason less tightly: give them room, keep them deterministic.
    max_tokens: Math.max(args.maxTokens ?? 512, 256),
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `${args.system}\n\nReply with only a JSON object that matches this JSON Schema, no prose and no code fence:\n${JSON.stringify(args.schema)}`,
      },
      { role: "user", content: args.user },
    ],
    response_format: { type: "json_schema", json_schema: { name: "output", schema: args.schema, strict: true } },
  };
}

/** Plain-text helper call (chunk contextualization). */
export async function localTextCall(args: {
  client: LocalLlmClient;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
}): Promise<{ text: string; usage: UsageCost }> {
  const { text, usage } = await args.client.chat({
    model: args.model,
    max_tokens: args.maxTokens,
    temperature: 0,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
  });
  return { text: stripReasoning(text).trim(), usage };
}
