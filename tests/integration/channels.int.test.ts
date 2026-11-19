// M7 "done when": the same question gives different answers to two Slack
// users and to two MCP users with different roles.
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import org from "../../seed/org.json";
import { answerQuestion } from "@/lib/answer/answer";
import { ask, getDocument, searchDocs } from "@/lib/mcp/tools";
import { sessionForSlackUser } from "@/lib/slack/identity";
import { serviceClient } from "../../scripts/lib/local";

const QUESTION = "2027 yönetim kurulu stratejisinde gelir ve FAVÖK hedefleri nedir?";
const db = serviceClient();

async function accessToken(key: string) {
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data } = await anon.auth.signInWithPassword({ email: `${key}@${org.emailDomain}`, password: process.env.DEMO_PASSWORD! });
  return data.session!.access_token;
}
const ctx = (token?: string) => ({ http: { authInfo: token ? { token } : undefined } });

let boardDocId: string;
beforeAll(async () => {
  const { data: doc } = await db.from("documents").select("id").eq("slug", "board-strategy-notes-2027").single();
  boardDocId = doc!.id;
  const { data: people } = await db.from("profiles").select("id, email").in("email", ["ayse@atlas-lojistik.test", "selin@atlas-lojistik.test"]);
  const id = (e: string) => people!.find((p) => p.email === e)!.id;
  await db.from("slack_identities").upsert([
    { team_id: "T_TEST", slack_user_id: "U_AYSE", user_id: id("ayse@atlas-lojistik.test") },
    { team_id: "T_TEST", slack_user_id: "U_SELIN", user_id: id("selin@atlas-lojistik.test") },
  ]);
});
afterAll(async () => {
  await db.from("slack_identities").delete().eq("team_id", "T_TEST");
});

describe("Slack identity bridge", () => {
  it("unmapped Slack users get no session (they are sent a link instead)", async () => {
    expect(await sessionForSlackUser("T_TEST", "U_UNKNOWN")).toBeNull();
  });

  it("two Slack users get different answers to the same question", async () => {
    const ayse = (await sessionForSlackUser("T_TEST", "U_AYSE"))!;
    const selin = (await sessionForSlackUser("T_TEST", "U_SELIN"))!;
    try {
      expect(ayse.session.channel).toBe("slack");
      const [a, s] = await Promise.all([
        answerQuestion(ayse.session, { question: QUESTION, persist: false }),
        answerQuestion(selin.session, { question: QUESTION, persist: false }),
      ]);
      expect(s.sources.some((x) => x.documentId === boardDocId)).toBe(true);
      expect(a.sources.some((x) => x.documentId === boardDocId)).toBe(false);
      expect(a.text).not.toEqual(s.text);
    } finally {
      await ayse.release();
      await selin.release();
    }
  });
});

describe("MCP tools", () => {
  it("reject calls without a verified token", async () => {
    expect((await searchDocs(ctx(), { query: "x", limit: 3 })).isError).toBe(true);
    expect((await searchDocs(ctx("not-a-jwt"), { query: "x", limit: 3 })).isError).toBe(true);
  });

  it("two MCP users get different search results and answers", async () => {
    const [ayse, selin] = await Promise.all([accessToken("ayse"), accessToken("selin")]);
    const [sa, ss] = await Promise.all([
      searchDocs(ctx(ayse), { query: QUESTION, limit: 5 }),
      searchDocs(ctx(selin), { query: QUESTION, limit: 5 }),
    ]);
    expect(ss.content[0].text).toContain(boardDocId);
    expect(sa.content[0].text).not.toContain(boardDocId);
    const [aa, as] = await Promise.all([ask(ctx(ayse), { question: QUESTION }), ask(ctx(selin), { question: QUESTION })]);
    expect(aa.content[0].text).not.toEqual(as.content[0].text);
  });

  it("get_document re-checks the ACL (and hides whether the doc exists)", async () => {
    const [ayse, selin, burak] = await Promise.all([accessToken("ayse"), accessToken("selin"), accessToken("burak")]);
    expect((await getDocument(ctx(ayse), { id: boardDocId })).content[0].text).toBe("Document not found or not accessible.");
    // Admins see document metadata in the admin UI, but not restricted content.
    expect((await getDocument(ctx(burak), { id: boardDocId })).content[0].text).toBe("Document not found or not accessible.");
    expect((await getDocument(ctx(selin), { id: boardDocId })).content[0].text).toContain("CANARY-BOARD");
  });
});
