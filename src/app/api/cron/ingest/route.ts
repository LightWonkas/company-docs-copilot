import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getEmbedder } from "@/lib/embeddings/embedder";
import { drainQueue } from "@/lib/ingest/worker";
import { getHelperLlm } from "@/lib/llm/provider";
import { createAdminClient } from "@/lib/supabase/admin";

// Vercel Cron entry point for the ingest worker. Runs outside any user
// request, authenticated by CRON_SECRET; this is the one route allowed to use
// the secret key (ingestion is an admin job).
export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const stats = await drainQueue(
    {
      db: createAdminClient(),
      embedder: getEmbedder(),
      llm: getHelperLlm(),
    },
    { maxMessages: 10 },
  );
  // Ids and counts only: no document text in responses or logs.
  return NextResponse.json({
    processed: stats.processed.map((r) => ({ id: r.documentId, chunks: r.chunks, flags: r.flags.length })),
    failed: stats.failed.map((f) => f.documentId),
  });
}
