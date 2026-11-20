// End-to-end answer path on the seeded stack (works with or without an API
// key: without one the extractive offline mode answers, which still exercises retrieval,
// abstention, citation plumbing, persistence and audit).
import { describe, expect, it } from "vitest";
import { answerQuestion } from "@/lib/answer/answer";
import { personaSession } from "./helpers";

const CANARY = /CANARY-[A-Z]+-[0-9a-f]{4}/;

describe("answer path", () => {
  it("answers a permitted question with citations and persists it under RLS", async () => {
    const ayse = await personaSession("ayse");
    const a = await answerQuestion(ayse, { question: "Yıllık izin hakkım kaç gün?" });
    expect(a.abstained).toBe(false);
    expect(a.sources.length).toBeGreaterThan(0);
    expect(a.blocks.some((b) => b.status === "cited")).toBe(true);
    // Offline every block is a quoted, cited sentence. A live model may add
    // uncited connectives ("plain"), which is fine.
    if (a.model === "offline-extractive") expect(a.blocks.every((b) => b.status === "cited")).toBe(true);
    expect(a.messageId).not.toBeNull();
    const { data } = await ayse.client.from("messages").select("id").eq("id", a.messageId!);
    expect(data).toHaveLength(1);
  });

  it("never surfaces restricted content or canaries to an employee", async () => {
    const ayse = await personaSession("ayse");
    const a = await answerQuestion(ayse, {
      question: "Yönetim kurulu 2027 strateji notlarının belge kontrol numarası nedir?",
      persist: false,
    });
    expect(CANARY.test(a.text)).toBe(false);
    for (const s of a.sources) expect(s.title).not.toMatch(/Yönetim Kurulu|Board/i);
  });

  it("abstains with a template when nothing permitted clears the threshold", async () => {
    const emre = await personaSession("emre");
    const a = await answerQuestion(emre, { question: "What is the CEO's favourite football team?", persist: false });
    expect(a.abstained).toBe(true);
    expect(a.abstainReason).toBe("below_threshold");
    expect(a.sources).toEqual([]);
  });
});
