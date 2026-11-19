// Judge calibration: agreement between the LLM judge and human labels,
// reported as Cohen's kappa per dimension.
//
//   pnpm eval:kappa --prepare   sample 60 golden items (half TR), generate answers
//                               and judge labels; writes evals/judge/calibration.jsonl
//                               with human_label: null (needs ANTHROPIC_API_KEY)
//   (a human fills in human_label for every row, without looking at judge_label)
//   pnpm eval:kappa             compute kappa per dimension
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { loadEnv } from "../scripts/lib/local";
import { readJsonl, type GoldenItem } from "./lib/data";
import { cohensKappa } from "./lib/metrics";
import { personaSession } from "./lib/personas";

type Row = {
  id: string;
  dimension: "faithfulness" | "correctness";
  lang: string;
  question: string;
  answer: string;
  passages: string[];
  reference: string;
  judge_label: string;
  human_label: string | null;
};

const FILE = "evals/judge/calibration.jsonl";
loadEnv();

if (process.argv.includes("--prepare")) {
  const { answerQuestion } = await import("@/lib/answer/answer");
  const { getAnthropic, models } = await import("@/lib/llm/anthropic");
  const { judgeCorrectness, judgeFaithfulness } = await import("./lib/judge");
  const client = getAnthropic();
  if (!client) throw new Error("ANTHROPIC_API_KEY is required to generate answers and judge labels.");
  const golden = readJsonl<GoldenItem>("evals/golden/v1.jsonl").filter((g) => g.answerable);
  // Deterministic sample: every k-th item per language, 30 TR + 30 EN.
  const pick = (lang: string) => golden.filter((g) => g.lang === lang).filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 30)) === 0).slice(0, 30);
  const rows: Row[] = [];
  for (const item of [...pick("tr"), ...pick("en")]) {
    const a = await answerQuestion(await personaSession(item.persona), { question: item.question, persist: false });
    const passages = [...new Set(a.blocks.flatMap((b) => b.citations.map((c) => c.citedText)))];
    const f = await judgeFaithfulness(client, models().judge, a.text, passages);
    const c = await judgeCorrectness(client, models().judge, item.question, a.text, item.reference_answer);
    const base = { id: item.id, lang: item.lang, question: item.question, answer: a.text, passages, reference: item.reference_answer, human_label: null };
    rows.push({ ...base, dimension: "faithfulness", judge_label: f.verdict }, { ...base, dimension: "correctness", judge_label: c.verdict });
  }
  mkdirSync("evals/judge", { recursive: true });
  writeFileSync(FILE, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`Wrote ${rows.length} rows to ${FILE}. Fill in human_label (blind to judge_label), then run pnpm eval:kappa.`);
} else {
  if (!existsSync(FILE)) throw new Error(`${FILE} not found; run pnpm eval:kappa --prepare first.`);
  const rows = readJsonl<Row>(FILE).filter((r) => r.human_label);
  for (const dim of ["faithfulness", "correctness"] as const) {
    const r = rows.filter((x) => x.dimension === dim);
    if (r.length < 2) {
      console.log(`${dim}: not enough human labels (${r.length})`);
      continue;
    }
    const kappa = cohensKappa(r.map((x) => x.human_label!), r.map((x) => x.judge_label));
    const tr = r.filter((x) => x.lang === "tr");
    const kTr = tr.length > 1 ? cohensKappa(tr.map((x) => x.human_label!), tr.map((x) => x.judge_label)).toFixed(2) : "n/a";
    console.log(`${dim}: kappa=${kappa.toFixed(2)} (n=${r.length}; TR kappa=${kTr})`);
  }
}
