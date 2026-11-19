import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { answerQuestion, type AnswerEvent } from "@/lib/answer/answer";
import { NotAuthenticatedError, userSessionFromClient } from "@/lib/retrieval/session";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const Body = z.object({
  question: z.string().trim().min(1).max(2000),
  conversationId: z.uuid().nullish(),
});

// Streams NDJSON events: status -> delta* -> final. Runs entirely on the
// caller's JWT (cookie session); there is no other identity in this route.
export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  let session;
  try {
    session = await userSessionFromClient(await createClient(), "web");
  } catch (err) {
    if (err instanceof NotAuthenticatedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    throw err;
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AnswerEvent | { type: "error"; message: string }) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        await answerQuestion(session, { question: parsed.data.question, conversationId: parsed.data.conversationId }, send);
      } catch {
        // No internals (or document text) in client-facing errors.
        send({ type: "error", message: "Something went wrong while answering. Please try again." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
