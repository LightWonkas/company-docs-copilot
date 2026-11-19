import { ingestDocument, type IngestDeps, type IngestResult } from "./pipeline";

const MAX_ATTEMPTS = 3;

export type DrainStats = { processed: IngestResult[]; failed: { documentId: string; error: string }[] };

/**
 * Drains the Supabase Queue. A message stays invisible for the visibility
 * timeout while it is processed; on a crash it reappears and is retried, and
 * after MAX_ATTEMPTS it is acked so one bad file can't block the queue.
 */
export async function drainQueue(deps: IngestDeps, opts: { maxMessages?: number } = {}): Promise<DrainStats> {
  const stats: DrainStats = { processed: [], failed: [] };
  const limit = opts.maxMessages ?? Infinity;

  while (stats.processed.length + stats.failed.length < limit) {
    const { data: messages, error } = await deps.db.rpc("ingest_dequeue", {
      p_visibility_seconds: 300,
      p_qty: 5,
    });
    if (error) throw new Error(`ingest_dequeue: ${error.message}`);
    if (!messages?.length) break;

    for (const msg of messages) {
      const documentId = (msg.message as { document_id?: string }).document_id;
      if (!documentId) {
        await deps.db.rpc("ingest_ack", { p_msg_id: msg.msg_id });
        continue;
      }
      try {
        stats.processed.push(await ingestDocument(documentId, deps));
        await deps.db.rpc("ingest_ack", { p_msg_id: msg.msg_id });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        stats.failed.push({ documentId, error: message });
        if (msg.read_ct >= MAX_ATTEMPTS) await deps.db.rpc("ingest_ack", { p_msg_id: msg.msg_id });
      }
    }
  }
  return stats;
}
