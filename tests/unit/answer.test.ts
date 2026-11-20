import { describe, expect, it } from "vitest";
import { abstentionText, owningDepartment } from "@/lib/answer/abstain";
import { isModelAbstention, looksFactual, validateAnswer } from "@/lib/answer/citations";
import { ANSWER_SYSTEM, buildAnswerRequest, citationBlocks, type SentSearchResult } from "@/lib/answer/prompt";
import { queryHash, redactQuery } from "@/lib/answer/redact";
import { isAllowedHref } from "@/components/chat/safe-markdown";

const sent: SentSearchResult[] = [
  { source: "kb://d1#c1", chunkId: "c1", documentId: "d1", title: "Leave", blocks: ["Employees get 16 days.", "Seniors get 22 days."] },
  { source: "kb://d2#c2", chunkId: "c2", documentId: "d2", title: "Travel", blocks: ["Per diem is 1,250 TL."] },
];
const permitted = new Set(["c1", "c2"]);
const cite = (over: Record<string, unknown> = {}) => ({
  type: "search_result_location",
  search_result_index: 0,
  source: "kb://d1#c1",
  start_block_index: 0,
  end_block_index: 1,
  cited_text: "Employees get 16 days.",
  title: "Leave",
  ...over,
});

describe("validateAnswer", () => {
  it("accepts a well-formed citation", () => {
    const v = validateAnswer([{ type: "text", text: "You get 16 days.", citations: [cite()] }], sent, permitted);
    expect(v.invalid).toBe(0);
    expect(v.blocks[0].status).toBe("cited");
    expect(v.citedChunkIds).toEqual(["c1"]);
  });

  it.each([
    ["index out of range", { search_result_index: 5 }],
    ["source mismatch (model points at another doc)", { source: "kb://d2#c2" }],
    ["cited_text not in the cited blocks", { cited_text: "Employees get 30 days." }],
    ["wrong location type", { type: "char_location" }],
    ["inverted block range", { start_block_index: 1, end_block_index: 0 }],
  ])("rejects %s", (_name, over) => {
    const v = validateAnswer([{ type: "text", text: "You get 16 days.", citations: [cite(over)] }], sent, permitted);
    expect(v.invalid).toBe(1);
    expect(v.blocks[0].citations).toEqual([]);
    expect(v.blocks[0].status).toBe("unverified");
  });

  it("rejects a citation to a chunk outside this request's permitted set", () => {
    const v = validateAnswer([{ type: "text", text: "x", citations: [cite()] }], sent, new Set(["c2"]));
    expect(v.invalid).toBe(1);
    expect(v.deniedChunkIds).toEqual(["c1"]);
  });

  it("accepts end_block_index as either exclusive or inclusive", () => {
    const v = validateAnswer(
      [{ type: "text", text: "x", citations: [cite({ start_block_index: 1, end_block_index: 1, cited_text: "Seniors get 22 days." })] }],
      sent,
      permitted,
    );
    expect(v.invalid).toBe(0);
  });

  it("accepts cited_text spanning table-row blocks the API joined without a separator", () => {
    // Observed live: "...per week |" + "| Secondary..." arrives as "...per week || Secondary...".
    const table: SentSearchResult[] = [
      { source: "kb://d3#c3", chunkId: "c3", documentId: "d3", title: "On-call", blocks: ["| Primary | 2,750 TL per week |", "| Secondary | 1,250 TL per week |"] },
    ];
    const v = validateAnswer(
      [{ type: "text", text: "x", citations: [cite({ source: "kb://d3#c3", end_block_index: 2, cited_text: "| Primary | 2,750 TL per week || Secondary | 1,250 TL per week |" })] }],
      table,
      new Set(["c3"]),
    );
    expect(v.invalid).toBe(0);
  });

  it("marks uncited factual text unverified but leaves connectives plain", () => {
    const v = validateAnswer(
      [
        { type: "text", text: "In addition, " },
        { type: "text", text: "the company pays 2,000 TL for glasses." },
      ],
      sent,
      permitted,
    );
    expect(v.blocks.map((b) => b.status)).toEqual(["plain", "unverified"]);
  });
});

describe("abstention", () => {
  it("detects the model's <abstain/> deterministically", () => {
    expect(isModelAbstention([{ text: "<abstain/>" }])).toBe(true);
    expect(isModelAbstention([{ text: "16 days." }])).toBe(false);
  });

  it("templates the answer in the user's language and suggests the owning department", () => {
    expect(abstentionText("Yıllık izin kaç gün?", "tr")).toContain("İnsan Kaynakları");
    expect(abstentionText("How do I reset my VPN password?", "en")).toContain("IT");
    expect(owningDepartment("weather tomorrow", "en")).toBeNull();
  });

  it("looksFactual", () => {
    expect(looksFactual("16 days")).toBe(true);
    expect(looksFactual("and")).toBe(false);
  });
});

describe("buildAnswerRequest", () => {
  const req = buildAnswerRequest({ model: "claude-sonnet-5-5", question: "Kaç gün?", results: sent, history: [], effort: "medium" });

  it("sends chunks as search_result blocks with citations, no tools, no structured output", () => {
    const user = req.messages.at(-1)!;
    const content = user.content as { type: string; citations?: { enabled: boolean }; source?: string }[];
    expect(content.filter((b) => b.type === "search_result")).toHaveLength(2);
    expect(content.every((b) => b.type !== "search_result" || b.citations?.enabled)).toBe(true);
    expect(content.at(-1)!.type).toBe("text");
    expect(req.tools).toBeUndefined();
    expect(req.output_config?.format).toBeUndefined();
    expect(JSON.stringify(req)).not.toContain("budget_tokens");
  });

  it("puts the only cache breakpoint after the static system prompt", () => {
    const system = req.system as { text: string; cache_control?: unknown }[];
    expect(system[0].text).toBe(ANSWER_SYSTEM);
    expect(system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(JSON.stringify(req.messages)).not.toContain("cache_control");
  });

  it("enables server-side refusal fallbacks", () => {
    expect(req.fallbacks).toBe("default");
    expect(req.betas).toContain("server-side-fallback-2026-07-01");
  });
});

describe("citationBlocks", () => {
  it("splits prose into 1-2 sentence blocks and groups table rows", () => {
    const blocks = citationBlocks("One. Two. Three.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |");
    expect(blocks[0]).toBe("One. Two.");
    expect(blocks[1]).toBe("Three.");
    expect(blocks.slice(2)).toHaveLength(2);
  });
});

describe("redaction", () => {
  it("removes personal data from audit queries", () => {
    const q = "ayse@atlas-lojistik.test 0532 123 45 67 TR33 0006 1005 1978 6457 8413 26 12345678901 maaşım?";
    const r = redactQuery(q);
    expect(r).not.toMatch(/ayse@|0532|TR33|12345678901/);
    expect(r).toContain("[email]");
    expect(queryHash("Maaş?")).toBe(queryHash("  maaş? "));
  });
});

describe("markdown link allowlist", () => {
  it.each([
    ["/documents/x", true],
    ["https://exfil.example/c?d=1", false],
    ["//exfil.example", false],
    ["javascript:alert(1)", false],
    [undefined, false],
  ])("%s -> %s", (href, ok) => {
    expect(isAllowedHref(href)).toBe(ok);
  });
});
