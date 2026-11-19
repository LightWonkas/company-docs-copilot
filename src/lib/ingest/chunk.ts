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
  let chunkOrdinal = 0;

  for (const [sectionIndex, section] of raw.entries()) {
    const basePath = [docTitle, section.heading].filter((x): x is string => Boolean(x));
    const sectionText = [section.heading ? `## ${section.heading}` : null, ...section.blocks.map(renderBlock)]
      .filter(Boolean)
      .join("\n\n");

    const chunks: ChunkDraft[] = [];
    let parts: string[] = [];
    let subheading: string | null = null;
    let chunkSubheading: string | null = null;

    const emit = async () => {
      const text = parts.join("\n\n").trim();
      if (!text) return;
      chunks.push({
        ordinal: chunkOrdinal++,
        text,
        tokens: await opts.countTokens(text),
        headingPath: chunkSubheading ? [...basePath, chunkSubheading] : basePath,
      });
      // Overlap comes from prose only; never repeat a table.
      const last = parts[parts.length - 1];
      parts = [];
      if (last && !last.trimStart().startsWith("|")) {
        const tail = await overlapTail(last, opts);
        if (tail) parts.push(tail);
      }
      chunkSubheading = subheading;
    };

    for (const block of section.blocks) {
      if (block.kind === "heading") {
        subheading = block.text;
        if (parts.length === 0 || (await opts.countTokens(parts.join("\n\n"))) < opts.minTokens) {
          chunkSubheading ??= subheading;
        }
      }
      const text = renderBlock(block);
      const blockTokens = await opts.countTokens(text);

      if (blockTokens > opts.maxTokens && block.kind !== "table" && block.kind !== "code") {
        for (const piece of await splitOversized(text, opts)) {
          if (parts.length && (await opts.countTokens([...parts, piece].join("\n\n"))) > opts.maxTokens) await emit();
          parts.push(piece);
        }
        continue;
      }
      if (parts.length && (await opts.countTokens([...parts, text].join("\n\n"))) > opts.maxTokens) {
        await emit();
      }
      parts.push(text);
      chunkSubheading ??= subheading;
    }
    await emit();

    // A short tail chunk merges back into its predecessor when it fits.
    if (chunks.length >= 2) {
      const last = chunks[chunks.length - 1];
      const prev = chunks[chunks.length - 2];
      if (last.tokens < opts.minTokens / 2) {
        const merged = `${prev.text}\n\n${last.text}`;
        const mergedTokens = await opts.countTokens(merged);
        if (mergedTokens <= opts.maxTokens * 1.1) {
          chunks.splice(chunks.length - 2, 2, { ...prev, text: merged, tokens: mergedTokens });
          chunkOrdinal--;
        }
      }
    }

    sections.push({
      ordinal: sectionIndex,
      headingPath: basePath,
      text: sectionText,
      tokens: await opts.countTokens(sectionText),
      chunks,
    });
  }

  // Renumber chunks densely after merges.
  let n = 0;
  for (const s of sections) for (const c of s.chunks) c.ordinal = n++;
  return sections;
}

function renderBlock(block: Block): string {
  if (block.kind === "heading") return `${"#".repeat(block.level ?? 3)} ${block.text}`;
  return block.text;
}
