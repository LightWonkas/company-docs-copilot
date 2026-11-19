import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type GoldenItem = {
  id: string;
  lang: "tr" | "en";
  question: string;
  answerable: boolean;
  category: string;
  persona: string;
  gold_doc_slugs: string[];
  evidence: { doc_slug: string; quote: string }[];
  reference_answer: string;
  verified_by: string | null;
};

export type AttackItem = { id: string; target_doc_slug: string; technique: string; lang: "tr" | "en"; question: string };

export function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

const normalize = (s: string) => s.replace(/\*\*|__|`/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase("tr-TR");

export type CorpusIndex = {
  docIdBySlug: Map<string, string>;
  slugByDocId: Map<string, string>;
  chunks: { id: string; documentId: string; text: string }[];
};

/** Admin-side read of the whole corpus (eval harness only, local stack). */
export async function loadCorpusIndex(db: SupabaseClient<Database>): Promise<CorpusIndex> {
  const [{ data: docs }, { data: chunks }] = await Promise.all([
    db.from("documents").select("id, slug"),
    db.from("chunks").select("id, document_id, text").eq("kind", "chunk"),
  ]);
  return {
    docIdBySlug: new Map((docs ?? []).map((d) => [d.slug, d.id])),
    slugByDocId: new Map((docs ?? []).map((d) => [d.id, d.slug])),
    chunks: (chunks ?? []).map((c) => ({ id: c.id, documentId: c.document_id, text: normalize(c.text) })),
  };
}

/**
 * Gold chunk ids are resolved from evidence quotes at eval time, so the
 * golden set survives any change to chunking. A quote cut by a chunk boundary
 * matches the chunk holding most of its words.
 */
export function goldChunkIds(item: GoldenItem, index: CorpusIndex): Set<string> {
  const ids = new Set<string>();
  for (const ev of item.evidence) {
    const docId = index.docIdBySlug.get(ev.doc_slug);
    const quote = normalize(ev.quote);
    const candidates = index.chunks.filter((c) => c.documentId === docId);
    const exact = candidates.filter((c) => c.text.includes(quote));
    if (exact.length) {
      exact.forEach((c) => ids.add(c.id));
      continue;
    }
    const words = quote.split(" ");
    let best: { id: string; score: number } | null = null;
    for (const c of candidates) {
      const score = words.filter((w) => c.text.includes(w)).length / words.length;
      if (!best || score > best.score) best = { id: c.id, score };
    }
    if (best && best.score >= 0.6) ids.add(best.id);
  }
  return ids;
}
