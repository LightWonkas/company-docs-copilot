import Link from "next/link";
import { Suspense } from "react";
import { Chat, type ChatMessage } from "@/components/chat/chat";
import type { AnswerBlock } from "@/lib/answer/citations";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <main className="flex flex-1 gap-6 py-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <ChatPage searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ChatPage({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const user = await requireUser();
  const { c } = await searchParams;
  const conversationId = typeof c === "string" ? c : null;
  const supabase = await createClient();

  // RLS: only the caller's own conversations and messages are visible.
  const [{ data: conversations }, { data: rows }] = await Promise.all([
    supabase.from("conversations").select("id, title").order("updated_at", { ascending: false }).limit(30),
    conversationId
      ? supabase
          .from("messages")
          .select("id, role, content, blocks, abstained, model, cost_usd, latency_ms")
          .eq("conversation_id", conversationId)
          .order("created_at")
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const initial: ChatMessage[] = (rows ?? []).map((m) => ({
    id: m.id,
    role: m.role as ChatMessage["role"],
    content: m.content,
    blocks: m.role === "assistant" ? (m.blocks as unknown as AnswerBlock[]) : [],
    abstained: m.abstained,
    model: m.model ?? undefined,
    costUsd: m.cost_usd == null ? null : Number(m.cost_usd),
    latencyMs: m.latency_ms,
  }));

  return (
    <>
      <aside className="hidden w-56 shrink-0 flex-col gap-1 text-sm md:flex">
        <Link href="/" className="mb-2 rounded-lg border px-2 py-1 text-center hover:bg-muted">
          + New chat
        </Link>
        {(conversations ?? []).map((conv) => (
          <Link
            key={conv.id}
            href={`/?c=${conv.id}`}
            className={`truncate rounded px-2 py-1 hover:bg-muted ${conv.id === conversationId ? "bg-muted" : ""}`}
          >
            {conv.title || "Untitled"}
          </Link>
        ))}
      </aside>
      <section className="flex flex-1 flex-col">
        {/* key: a different conversation remounts the client state */}
        <Chat key={conversationId ?? "new"} conversationId={conversationId} initial={initial} showCost={user.role === "admin"} />
      </section>
    </>
  );
}
