// promptfoo custom provider: runs the real answer pipeline as a seeded
// persona (RLS applies), returning the answer as output and the cited
// passages as metadata.retrievedContext for context-* assertions.
import { execFileSync } from "node:child_process";

export default class DocsCopilotProvider {
  constructor(options = {}) {
    this.providerId = options.id || "docs-copilot";
    this.config = options.config || {};
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context) {
    const persona = context?.vars?.persona ?? this.config.persona ?? "ayse";
    const question = context?.vars?.query ?? prompt;
    try {
      const raw = execFileSync("pnpm", ["exec", "tsx", "evals/promptfoo/ask.ts", persona, question], {
        encoding: "utf8",
        shell: process.platform === "win32",
        maxBuffer: 10 * 1024 * 1024,
      });
      const result = JSON.parse(raw.slice(raw.indexOf("{")));
      return {
        output: result.answer,
        metadata: { retrievedContext: result.context.length ? result.context : ["(no permitted context)"], abstained: result.abstained, model: result.model },
      };
    } catch (error) {
      return { error: String(error) };
    }
  }
}
