// Markdown -> sections (parents) -> chunks (retrievable units).
//
// * Sections are H2-level (H1 is the document title); deeper headings stay
//   inline and refine a chunk's heading path.
// * Chunks pack whole blocks (paragraphs, lists, tables, code) up to
//   maxTokens, measured with the embedder's own tokenizer.
// * Tables are never split; an oversized table becomes its own chunk.
// * Consecutive chunks of a section overlap by ~10–15% (trailing sentences).

export type ChunkOptions = {
  minTokens: number;
  maxTokens: number;
  overlapRatio: number;
  countTokens: (text: string) => Promise<number>;
};

export const DEFAULT_CHUNKING = { minTokens: 300, maxTokens: 500, overlapRatio: 0.12 } as const;

export type ChunkDraft = { ordinal: number; text: string; tokens: number; headingPath: string[] };
export type SectionDraft = {
  ordinal: number;
  headingPath: string[];
  text: string;
  tokens: number;
  chunks: ChunkDraft[];
};

type Block = { text: string; kind: "heading" | "table" | "code" | "text"; level?: number };

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

export function splitBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let buffer: string[] = [];
  let bufferKind: Block["kind"] = "text";

  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text) blocks.push({ text, kind: bufferKind });
    buffer = [];
    bufferKind = "text";
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith("```")) {
      flush();
      const code = [line];
      while (++i < lines.length) {
        code.push(lines[i]);
        if (lines[i].trimStart().startsWith("```")) break;
      }
      blocks.push({ text: code.join("\n"), kind: "code" });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ text: heading[2].trim(), kind: "heading", level: heading[1].length });
      continue;
    }
    const isTableLine = line.trimStart().startsWith("|");
    if (isTableLine !== (bufferKind === "table") && buffer.length) flush();
    if (isTableLine) bufferKind = "table";
    if (!line.trim()) {
      flush();
      continue;
    }
    buffer.push(line);
  }
  flush();
  return blocks;
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?…])\s+(?=[A-ZÇĞİÖŞÜ0-9"“(])/u).filter(Boolean);
}

/** Splits a non-table block that alone exceeds maxTokens. */
async function splitOversized(text: string, opts: ChunkOptions): Promise<string[]> {
  const parts: string[] = [];
  let current = "";
  const units = sentences(text).flatMap((s) => (s.length > 2000 ? s.match(/[\s\S]{1,1500}(\s|$)/g) ?? [s] : [s]));
  for (const unit of units) {
    const candidate = current ? `${current} ${unit}` : unit;
    if (current && (await opts.countTokens(candidate)) > opts.maxTokens) {
      parts.push(current);
      current = unit;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);
  return parts;
}

async function overlapTail(text: string, opts: ChunkOptions): Promise<string> {
  const budget = Math.floor(opts.maxTokens * opts.overlapRatio);
  const parts = sentences(text);
  let tail = "";
  for (let i = parts.length - 1; i >= 0; i--) {
    const candidate = tail ? `${parts[i]} ${tail}` : parts[i];
    if ((await opts.countTokens(candidate)) > budget) break;
    tail = candidate;
  }
  return tail;
}

export async function chunkMarkdown(markdown: string, opts: ChunkOptions): Promise<SectionDraft[]> {
  const blocks = splitBlocks(markdown);
  const docTitle = blocks.find((b) => b.kind === "heading" && b.level === 1)?.text;

  // Group into H2 sections.
  type RawSection = { heading: string | null; blocks: Block[] };
  const raw: RawSection[] = [];
  let current: RawSection = { heading: null, blocks: [] };
  for (const block of blocks) {
    if (block.kind === "heading" && block.level === 1) continue;
    if (block.kind === "heading" && block.level === 2) {
      if (current.blocks.length) raw.push(current);
      current = { heading: block.text, blocks: [] };
      continue;
    }
    current.blocks.push(block);
  }
  if (current.blocks.length) raw.push(current);

  const sections: SectionDraft[] = [];
  for (const [index, section] of raw.entries()) {
    const sectionText = [section.heading ? `## ${section.heading}` : null, ...section.blocks.map(renderBlock)]
      .filter(Boolean)
      .join("\n\n");
    sections.push({
      ordinal: index,
      headingPath: [docTitle, section.heading].filter((x): x is string => Boolean(x)),
      text: sectionText,
      tokens: await opts.countTokens(sectionText),
      chunks: [],
    });
  }

  // Pack blocks across H2 boundaries: real documents have many short
  // sections, and chunks confined to one section end up far below the
  // 300-token floor. A chunk prefers to end at an H2 once it is big enough,
  // and belongs (small-to-big parent) to the section it starts in.
  type Item = { block: Block; section: number };
  const items: Item[] = raw.flatMap((s, i) => [
    ...(s.heading ? [{ block: { text: s.heading, kind: "heading" as const, level: 2 }, section: i }] : []),
    ...s.blocks.map((block) => ({ block, section: i })),
  ]);

  let parts: string[] = [];
  let startSection = 0;
  let startSubheading: string | null = null;
  let subheading: string | null = null;
  const tokensOf = (xs: string[]) => opts.countTokens(xs.join("\n\n"));

  const emit = async (withOverlap: boolean) => {
    const text = parts.join("\n\n").trim();
    if (text) {
      const base = sections[startSection]?.headingPath ?? [];
      sections[startSection]?.chunks.push({
        ordinal: 0,
        text,
        tokens: await opts.countTokens(text),
        headingPath: startSubheading ? [...base, startSubheading] : base,
      });
    }
    const last = parts[parts.length - 1];
    parts = [];
    // Overlap only when continuing the same topic, and never from a table.
    if (withOverlap && last && !last.trimStart().startsWith("|")) {
      const tail = await overlapTail(last, opts);
      if (tail) parts.push(tail);
    }
  };

  const begin = (item: Item) => {
    startSection = item.section;
    startSubheading = item.block.kind === "heading" && item.block.level === 2 ? null : subheading;
  };

  for (const item of items) {
    const { block } = item;
    const isH2 = block.kind === "heading" && block.level === 2;
    if (isH2) subheading = null;
    else if (block.kind === "heading") {
      subheading = block.text;
      // An H3 right after the chunk's H2 (no content yet) refines its path.
      if (parts.every((p) => p.startsWith("#"))) startSubheading = subheading;
    }

    const text = renderBlock(block);
    if (isH2 && parts.length && (await tokensOf(parts)) >= opts.minTokens) await emit(false);
    if (parts.length === 0) begin(item);

    const blockTokens = await opts.countTokens(text);
    if (blockTokens > opts.maxTokens && block.kind !== "table" && block.kind !== "code") {
      for (const piece of await splitOversized(text, opts)) {
        if (parts.length && (await tokensOf([...parts, piece])) > opts.maxTokens) {
          await emit(true);
          begin(item);
        }
        parts.push(piece);
      }
      continue;
    }
    if (parts.length && (await tokensOf([...parts, text])) > opts.maxTokens) {
      await emit(!isH2 && block.kind !== "heading");
      begin(item);
    }
    parts.push(text);
  }
  await emit(false);

  // A short final chunk merges back into its predecessor when it fits.
  const all = sections.flatMap((s) => s.chunks.map((c) => ({ s, c })));
  if (all.length >= 2) {
    const last = all[all.length - 1];
    const prev = all[all.length - 2];
    if (last.c.tokens < opts.minTokens / 2) {
      const merged = `${prev.c.text}\n\n${last.c.text}`;
      const mergedTokens = await opts.countTokens(merged);
      if (mergedTokens <= opts.maxTokens * 1.1) {
        prev.c.text = merged;
        prev.c.tokens = mergedTokens;
        last.s.chunks.pop();
      }
    }
  }

  let n = 0;
  for (const s of sections) for (const c of s.chunks) c.ordinal = n++;
  return sections;
}

function renderBlock(block: Block): string {
  if (block.kind === "heading") return `${"#".repeat(block.level ?? 3)} ${block.text}`;
  return block.text;
}
