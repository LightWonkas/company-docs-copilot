// Requires the local stack seeded with the corpus (`pnpm seed`).
import { beforeAll, describe, expect, it } from "vitest";
import org from "../../seed/org.json";
import { retrieve } from "@/lib/retrieval/retrieve";
import { personaSession, visibleDocumentIds } from "./helpers";

const BOARD_QUESTION = "2027 yönetim kurulu stratejisinde gelir ve FAVÖK hedefleri nedir?";

describe("permission-aware retrieval", () => {
  let boardDocId: string;

  beforeAll(async () => {
    const selin = await personaSession("selin");
    const { data } = await selin.client.from("documents").select("id").eq("slug", "board-strategy-notes-2027").single();
    boardDocId = data!.id;
  });

  it("the same question returns different chunks for an employee and an executive", async () => {
    const [ayse, selin] = await Promise.all([personaSession("ayse"), personaSession("selin")]);
    const [forAyse, forSelin] = await Promise.all([retrieve(ayse, BOARD_QUESTION), retrieve(selin, BOARD_QUESTION)]);

    const docsFor = (r: typeof forAyse) => new Set(r.candidates.map((c) => c.documentId));
    expect(docsFor(forSelin).has(boardDocId)).toBe(true);
    expect(docsFor(forAyse).has(boardDocId)).toBe(false);
    expect(forSelin.results.map((c) => c.chunkId)).not.toEqual(forAyse.results.map((c) => c.chunkId));
  });

  it.each(org.personas.map((p) => p.key))("%s never retrieves a chunk outside their RLS-visible set", async (key) => {
    const session = await personaSession(key);
    const visible = await visibleDocumentIds(session);
    const r = await retrieve(session, BOARD_QUESTION);
    for (const c of r.candidates) expect(visible.has(c.documentId)).toBe(true);
  });
});
