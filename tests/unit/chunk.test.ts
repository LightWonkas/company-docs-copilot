import { describe, expect, it } from "vitest";
import { chunkMarkdown, splitBlocks } from "@/lib/ingest/chunk";

// Whitespace tokenizer stand-in: the chunker only needs a monotonic counter.
const countTokens = async (text: string) => text.split(/\s+/).filter(Boolean).length;
const opts = { minTokens: 30, maxTokens: 50, overlapRatio: 0.12, countTokens };

const sentence = (i: number) => `Sentence number ${i} talks about leave policy details.`; // 8 tokens

function paragraph(start: number, count: number) {
  return Array.from({ length: count }, (_, k) => sentence(start + k)).join(" ");
}

describe("splitBlocks", () => {
  it("keeps a table as a single block", () => {
    const md = "Intro\n\n| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n\nAfter";
    const blocks = splitBlocks(md);
    expect(blocks.map((b) => b.kind)).toEqual(["text", "table", "text"]);
    expect(blocks[1].text.split("\n")).toHaveLength(4);
  });

  it("recognises headings and fenced code", () => {
    const blocks = splitBlocks("# Title\n\n## Section\n\n```\ncode\n\nmore\n```\n");
    expect(blocks.map((b) => b.kind)).toEqual(["heading", "heading", "code"]);
  });
});

describe("chunkMarkdown", () => {
  it("never exceeds maxTokens for prose and prefixes heading paths", async () => {
    const md = `# Leave Policy\n\n## Annual leave\n\n${paragraph(0, 6)}\n\n${paragraph(6, 6)}\n\n## Sick leave\n\n${paragraph(12, 3)}`;
    const sections = await chunkMarkdown(md, opts);
    expect(sections.map((s) => s.headingPath)).toEqual([
      ["Leave Policy", "Annual leave"],
      ["Leave Policy", "Sick leave"],
    ]);
    for (const chunk of sections.flatMap((s) => s.chunks)) {
      expect(chunk.tokens).toBeLessThanOrEqual(opts.maxTokens * 1.1);
    }
  });

  it("overlaps consecutive chunks within a section", async () => {
    const md = `## A\n\n${paragraph(0, 5)}\n\n${paragraph(5, 5)}\n\n${paragraph(10, 5)}`;
    // Overlap budget must fit one 8-token sentence: 0.2 * 50 = 10 tokens.
    const [section] = await chunkMarkdown(md, { ...opts, overlapRatio: 0.2 });
    expect(section.chunks.length).toBeGreaterThan(1);
    const [first, second] = section.chunks;
    const lastSentenceOfFirst = first.text.split(/(?<=\.)\s+/).pop()!;
    expect(second.text.startsWith(lastSentenceOfFirst)).toBe(true);
  });

  it("does not split a table even when it exceeds maxTokens", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => `| city ${i} | ${i * 10} TL | tier ${i % 3} |`).join("\n");
    const table = `| city | amount | tier |\n|---|---|---|\n${rows}`;
    const md = `## Per diem\n\n${paragraph(0, 2)}\n\n${table}\n\n${paragraph(2, 2)}`;
    const chunks = (await chunkMarkdown(md, opts)).flatMap((s) => s.chunks);
    const withTable = chunks.filter((c) => c.text.includes("| city 0 |"));
    expect(withTable).toHaveLength(1);
    expect(withTable[0].text).toContain("| city 19 |");
  });

  it("assigns dense ordinals across sections", async () => {
    const md = `## A\n\n${paragraph(0, 8)}\n\n## B\n\n${paragraph(8, 8)}`;
    const ordinals = (await chunkMarkdown(md, opts)).flatMap((s) => s.chunks.map((c) => c.ordinal));
    expect(ordinals).toEqual(ordinals.map((_, i) => i));
  });

  it("handles documents without headings (e.g. PDF text)", async () => {
    const sections = await chunkMarkdown(`${paragraph(0, 4)}\n\n${paragraph(4, 4)}`, opts);
    expect(sections).toHaveLength(1);
    expect(sections[0].headingPath).toEqual([]);
    expect(sections[0].chunks.length).toBeGreaterThan(0);
  });

  it("refines the heading path with an H3 subheading", async () => {
    const md = `# Doc\n\n## Travel\n\n### Per diem\n\n${paragraph(0, 3)}`;
    const [section] = await chunkMarkdown(md, opts);
    expect(section.chunks[0].headingPath).toEqual(["Doc", "Travel", "Per diem"]);
  });
});
