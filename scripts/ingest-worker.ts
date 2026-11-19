// Ingest worker: drains the Supabase Queue and ingests documents.
//   pnpm ingest:worker          drain once and exit
//   pnpm ingest:worker --watch  keep polling (local dev)
//   add --remote to run against a hosted project (uses SUPABASE_SECRET_KEY)
import { loadEnv, serviceClient } from "./lib/local";

loadEnv();
const { getEmbedder } = await import("../src/lib/embeddings/embedder");
const { getAnthropic, models } = await import("../src/lib/llm/anthropic");
const { drainQueue } = await import("../src/lib/ingest/worker");

const db = serviceClient({ allowRemote: process.argv.includes("--remote") });
const client = getAnthropic();
const deps = {
  db,
  embedder: getEmbedder(),
  llm: client ? { client, model: models().helper } : null,
  log: (m: string) => console.log(`  ${m}`),
};
if (!deps.llm) console.log("ANTHROPIC_API_KEY not set: skipping contextual retrieval and the LLM injection screen.");

do {
  const stats = await drainQueue(deps);
  for (const r of stats.processed) {
    console.log(`ingested ${r.documentId}: ${r.chunks} chunks${r.flags.length ? `, flags: ${r.flags.join(", ")}` : ""}`);
  }
  for (const f of stats.failed) console.error(`FAILED ${f.documentId}: ${f.error}`);
  if (process.argv.includes("--watch")) await new Promise((r) => setTimeout(r, 5000));
  else break;
} while (true);
