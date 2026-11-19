"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { submitFeedback } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import type { AnswerBlock } from "@/lib/answer/citations";
import { SafeMarkdown } from "./safe-markdown";

export type ChatMessage = {
  id: string | null;
  role: "user" | "assistant";
  content: string;
  blocks: AnswerBlock[];
  abstained?: boolean;
  model?: string;
  costUsd?: number | null;
  latencyMs?: number | null;
  pending?: boolean;
};

type StreamEvent =
  | { type: "status"; stage: string }
  | { type: "delta"; text: string }
  | { type: "error"; message: string }
  | {
      type: "final";
      answer: {
        conversationId: string | null;
        messageId: string | null;
        text: string;
        blocks: AnswerBlock[];
        abstained: boolean;
        model: string;
        costUsd: number;
        latencyMs: number;
      };
    };

/** Numbers each distinct cited chunk once, in order of first citation. */
function sourceIndex(blocks: AnswerBlock[]) {
  const order = new Map<string, { n: number; documentId: string; title: string; citedText: string[] }>();
  for (const b of blocks)
    for (const c of b.citations) {
      const entry = order.get(c.chunkId) ?? { n: order.size + 1, documentId: c.documentId, title: c.title, citedText: [] };
      entry.citedText.push(c.citedText);
      order.set(c.chunkId, entry);
    }
  return order;
}

function Answer({ message, showCost }: { message: ChatMessage; showCost: boolean }) {
  const sources = sourceIndex(message.blocks);
  const [rated, setRated] = useState<1 | -1 | null>(null);
  if (message.pending) {
    return <div className="whitespace-pre-wrap text-sm">{message.content || <span className="text-muted-foreground">Searching your documents…</span>}</div>;
  }
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="leading-relaxed">
        {message.blocks.map((b, i) => (
          <span
            key={i}
            className={b.status === "unverified" ? "underline decoration-amber-500 decoration-dotted" : undefined}
            title={b.status === "unverified" ? "Unverified: no citation supports this sentence" : undefined}
          >
            <SafeMarkdownInline text={b.text} />
            {b.citations.map((c) => {
              const n = sources.get(c.chunkId)?.n;
              return (
                <a
                  key={`${i}-${c.chunkId}`}
                  href={`/documents/${c.documentId}?chunk=${c.chunkId}`}
                  className="ml-0.5 align-super text-[10px] text-blue-700"
                  title={c.citedText}
                >
                  [{n}]
                </a>
              );
            })}
          </span>
        ))}
      </div>
      {sources.size > 0 && (
        <ol className="flex flex-col gap-1 rounded-lg border bg-muted/30 p-2 text-xs">
          {[...sources.entries()].map(([chunkId, s]) => (
            <li key={chunkId}>
              <a href={`/documents/${s.documentId}?chunk=${chunkId}`} className="font-medium text-blue-700">
                [{s.n}] {s.title}
              </a>
              <span className="block text-muted-foreground">“{s.citedText[0].slice(0, 200)}”</span>
            </li>
          ))}
        </ol>
      )}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {message.model === "offline-extractive" && <span>Offline mode (no API key): quoted passages only.</span>}
        {message.blocks.some((b) => b.status === "unverified") && <span>Dotted text is unverified.</span>}
        {showCost && message.costUsd != null && (
          <span>
            ${message.costUsd.toFixed(4)} · {message.latencyMs} ms
          </span>
        )}
        {message.id && (
          <span className="ml-auto flex gap-1">
            {([1, -1] as const).map((r) => (
              <button
                key={r}
                type="button"
                aria-label={r === 1 ? "Helpful" : "Not helpful"}
                className={`rounded px-1 ${rated === r ? "bg-muted text-foreground" : ""}`}
                onClick={async () => {
                  const reason = r === -1 ? (window.prompt("What was wrong? (optional)") ?? undefined) : undefined;
                  const { ok } = await submitFeedback({ messageId: message.id!, rating: r, reason });
                  if (ok) setRated(r);
                }}
              >
                {r === 1 ? "👍" : "👎"}
              </button>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

function SafeMarkdownInline({ text }: { text: string }) {
  // Citation blocks can be table rows without a header row, which Markdown
  // won't render as a table: show them monospaced instead.
  if (text.split("\n").every((l) => l.trimStart().startsWith("|"))) {
    return <pre className="my-1 whitespace-pre-wrap font-mono text-xs">{text}</pre>;
  }
  return /\n/.test(text) ? <SafeMarkdown text={text} /> : <>{text}</>;
}

export function Chat(props: { conversationId: string | null; initial: ChatMessage[]; showCost: boolean }) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(props.initial);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const conversationRef = useRef(props.conversationId);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setQuestion("");
    setMessages((m) => [
      ...m,
      { id: null, role: "user", content: q, blocks: [] },
      { id: null, role: "assistant", content: "", blocks: [], pending: true },
    ]);
    const update = (patch: Partial<ChatMessage>) =>
      setMessages((m) => [...m.slice(0, -1), { ...m[m.length - 1], ...patch }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, conversationId: conversationRef.current }),
      });
      if (!res.body) throw new Error("no body");
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let streamed = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line) as StreamEvent;
          if (event.type === "delta") {
            streamed += event.text;
            update({ content: streamed });
          } else if (event.type === "final") {
            const a = event.answer;
            update({ id: a.messageId, content: a.text, blocks: a.blocks, abstained: a.abstained, model: a.model, costUsd: a.costUsd, latencyMs: a.latencyMs, pending: false });
            if (!conversationRef.current && a.conversationId) {
              conversationRef.current = a.conversationId;
              router.replace(`/?c=${a.conversationId}`);
            }
          } else if (event.type === "error") {
            update({ content: event.message, blocks: [{ text: event.message, status: "plain", citations: [] }], pending: false });
          }
        }
      }
    } catch {
      update({ content: "Network error.", blocks: [{ text: "Network error.", status: "plain", citations: [] }], pending: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-1 flex-col gap-4">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Ask about company policies in Turkish or English. Answers only use documents you are allowed to read, and every
            claim links to its source.
          </p>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="self-end rounded-lg bg-muted px-3 py-2 text-sm">
              {m.content}
            </div>
          ) : (
            <Answer key={i} message={m} showCost={props.showCost} />
          ),
        )}
      </div>
      <form onSubmit={ask} className="sticky bottom-0 flex gap-2 bg-background py-3">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) ask(e);
          }}
          rows={2}
          placeholder="Örn. Yıllık izin hakkım kaç gün? / How do I claim travel expenses?"
          className="flex-1 resize-none rounded-lg border bg-background p-2 text-sm"
          aria-label="Question"
        />
        <Button type="submit" disabled={busy}>
          {busy ? "…" : "Ask"}
        </Button>
      </form>
    </div>
  );
}
