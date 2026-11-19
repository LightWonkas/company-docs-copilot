// Bridge for the promptfoo provider: answers one question as a persona and
// prints {answer, context} as JSON. context = the permitted passages the
// answer cites (fetched under the persona's own RLS).
import { loadEnv } from "../../scripts/lib/local";
import { personaSession } from "../lib/personas";

loadEnv();
const { answerQuestion } = await import("@/lib/answer/answer");
const [persona, question] = process.argv.slice(2);
const session = await personaSession(persona);
const answer = await answerQuestion(session, { question, persist: false });
const ids = answer.sources.map((s) => s.chunkId);
const { data } = ids.length ? await session.client.from("chunks").select("text").in("id", ids) : { data: [] };
process.stdout.write(
  JSON.stringify({ answer: answer.text, context: (data ?? []).map((c) => c.text), abstained: answer.abstained, model: answer.model }),
);
