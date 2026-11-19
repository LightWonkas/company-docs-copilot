import { createHash } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Embedder } from "@/lib/embeddings/embedder";
import { toVectorLiteral } from "@/lib/embeddings/embedder";
import type { Database } from "@/lib/supabase/database.types";
import { foldTurkish } from "@/lib/text/fold";
import { chunkMarkdown, DEFAULT_CHUNKING } from "./chunk";
import { contextualizeChunks } from "./contextualize";
import { extractMarkdown, kindFromName } from "./extract";
import { sanitizeHidden } from "./hygiene";
import { screenChunk } from "./screen";

/**
 * Runs in the ingest worker with the secret key (RLS bypassed), never in a
 * user request. It can only write chunks through replace_document_chunks,
 * whose triggers stamp org/ACL from the document row.
 */
export type IngestDeps = {
  db: SupabaseClient<Database>;
  embedder: Embedder;
  llm: { client: Anthropic; model: string } | null;
  log?: (message: string) => void;
};

export type IngestResult = { documentId: string; chunks: number; flags: string[]; contextualized: boolean };

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Text that gets embedded: heading path and context give a chunk its topic. */
export function embeddingInput(headingPath: string[], context: string | null, text: string): string {
  return [headingPath.join(" > "), context, text].filter(Boolean).join("\n");
}

export async function ingestDocument(documentId: string, deps: IngestDeps): Promise<IngestResult> {
  const { db, embedder, llm } = deps;
  const log = deps.log ?? (() => {});

  const { data: doc, error } = await db
    .from("documents")
    .select("id, title, language, storage_path")
    .eq("id", documentId)
    .single();
  if (error || !doc) throw new Error(`document ${documentId} not found`);
  if (!doc.storage_path) throw new Error(`document ${documentId} has no file`);

  await db.from("documents").update({ status: "processing", error: null }).eq("id", documentId);

  try {
    const download = await db.storage.from("documents").download(doc.storage_path);
    if (download.error) throw new Error(`download failed: ${download.error.message}`);
    const bytes = new Uint8Array(await download.data.arrayBuffer());
    const language = doc.language === "tr" ? "tr" : "en";

    const markdown = await extractMarkdown(bytes, kindFromName(doc.storage_path));
    const { text: visible, flags: hiddenFlags } = sanitizeHidden(markdown);

    const sections = await chunkMarkdown(visible, {
      ...DEFAULT_CHUNKING,
      countTokens: (t) => embedder.countTokens(t),
    });
    const chunks = sections.flatMap((s) => s.chunks);
    log(`${doc.title}: ${sections.length} sections, ${chunks.length} chunks`);

    const chunkFlags = await Promise.all(chunks.map((c) => screenChunk(c.text, llm)));

    const contexts = llm
      ? (
          await contextualizeChunks({
            client: llm.client,
            model: llm.model,
            documentTitle: doc.title,
            documentText: visible,
            language,
            chunks: chunks.map((c) => c.text),
          })
        ).contexts
      : chunks.map(() => null);

    const vectors = await embedder.embedPassages(
      chunks.map((c, i) => embeddingInput(c.headingPath, contexts[i], c.text)),
    );

    let i = 0;
    const payload = sections.map((s) => ({
      ordinal: s.ordinal,
      heading_path: s.headingPath,
      text: s.text,
      lang: language,
      tokens: s.tokens,
      chunks: s.chunks.map((c) => {
        const index = i++;
        const context = contexts[index];
        return {
          ordinal: c.ordinal,
          text: c.text,
          context,
          tokens: c.tokens,
          embedding: toVectorLiteral(vectors[index]),
          text_folded: foldTurkish([c.headingPath.join(" "), context, c.text].filter(Boolean).join(" ")),
          injection_suspected: chunkFlags[index].length > 0,
        };
      }),
    }));

    const flags = [...new Set([...hiddenFlags, ...chunkFlags.flat()])];
    const { error: rpcError } = await db.rpc("replace_document_chunks", {
      p_document_id: documentId,
      p_checksum: sha256(bytes),
      p_sections: payload,
      p_injection_flags: flags,
    });
    if (rpcError) throw new Error(`replace_document_chunks: ${rpcError.message}`);

    return { documentId, chunks: chunks.length, flags, contextualized: Boolean(llm) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.from("documents").update({ status: "failed", error: message.slice(0, 500) }).eq("id", documentId);
    throw err;
  }
}
