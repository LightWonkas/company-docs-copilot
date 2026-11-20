import type { SentSearchResult } from "./prompt";

export type ValidatedCitation = { chunkId: string; documentId: string; title: string; citedText: string };
export type AnswerBlock = {
  text: string;
  /** cited: has >= 1 valid citation; unverified: looks factual but uncited; plain: connective text */
  status: "cited" | "unverified" | "plain";
  citations: ValidatedCitation[];
};
export type Validation = {
  blocks: AnswerBlock[];
  invalid: number;
  citedChunkIds: string[];
  deniedChunkIds: string[];
};

/** Shape of a response text block (works for SDK and recorded fixtures). */
export type ResponseTextBlock = {
  type: string;
  text?: string;
  citations?: Array<Record<string, unknown>> | null;
};


// The API concatenates the cited blocks with no separator ("…week |" +
// "| On-call…" becomes "…week || On-call…"), so containment is checked with
// all whitespace removed on both sides.
const squash = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/**
 * Deterministic citation validation. A citation survives only if:
 *  - it is a search_result_location whose index is in range,
 *  - its source equals the source we sent at that index,
 *  - that chunk is in the permitted set for THIS request (retrieved under the
 *    user's RLS), and
 *  - cited_text actually appears in the cited block range.
 * Everything else is dropped and counted as invalid (never shown as a source).
 */
export function validateAnswer(
  content: ResponseTextBlock[],
  sent: SentSearchResult[],
  permittedChunkIds: Set<string>,
): Validation {
  let invalid = 0;
  const cited = new Set<string>();
  const denied = new Set<string>();
  const blocks: AnswerBlock[] = [];

  for (const block of content) {
    if (block.type !== "text" || !block.text) continue;
    const citations: ValidatedCitation[] = [];
    for (const raw of block.citations ?? []) {
      const c = raw as {
        type?: string;
        search_result_index?: number;
        source?: string;
        start_block_index?: number;
        end_block_index?: number;
        cited_text?: string;
      };
      const index = c.search_result_index ?? -1;
      const result = sent[index];
      const ok =
        c.type === "search_result_location" &&
        result !== undefined &&
        c.source === result.source &&
        typeof c.start_block_index === "number" &&
        typeof c.end_block_index === "number" &&
        c.start_block_index >= 0 &&
        c.end_block_index >= c.start_block_index &&
        c.start_block_index < result.blocks.length &&
        // end may be exclusive or inclusive; take the wider range.
        squash(result.blocks.slice(c.start_block_index, c.end_block_index + 1).join("")).includes(squash(c.cited_text ?? "")) &&
        squash(c.cited_text ?? "").length > 0;

      if (!ok || !permittedChunkIds.has(result.chunkId)) {
        invalid++;
        if (result) denied.add(result.chunkId);
        continue;
      }
      cited.add(result.chunkId);
      citations.push({ chunkId: result.chunkId, documentId: result.documentId, title: result.title, citedText: c.cited_text! });
    }
    blocks.push({
      text: block.text,
      citations,
      status: citations.length ? "cited" : looksFactual(block.text) ? "unverified" : "plain",
    });
  }
  return { blocks, invalid, citedChunkIds: [...cited], deniedChunkIds: [...denied] };
}

/** Uncited text that states something (numbers, or a real sentence) is flagged. */
export function looksFactual(text: string): boolean {
  // A line ending in ":" is a lead-in or label ("**Consolidated revenue:**",
  // "The 2027 targets are:"); it asserts nothing until the cited value after it.
  return text
    .split("\n")
    .map((l) => l.replace(/[*_#>\s-]+/g, " ").trim())
    .filter((l) => l && !l.endsWith(":"))
    .some((l) => /\d/.test(l) || l.replace(/[^\p{L}]/gu, "").length > 40);
}

export const ABSTAIN_TAG = "<abstain/>";

export function isModelAbstention(blocks: { text: string }[]): boolean {
  return blocks.map((b) => b.text).join("").includes(ABSTAIN_TAG);
}
