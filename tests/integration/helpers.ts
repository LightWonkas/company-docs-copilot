import { permittedChunks, personaSession } from "../../evals/lib/personas";
import type { UserSession } from "@/lib/retrieval/session";

export { personaSession };

/** Document ids a persona may read, straight from RLS (ground truth for leak checks). */
export async function visibleDocumentIds(session: UserSession): Promise<Set<string>> {
  return (await permittedChunks(session)).documentIds;
}
