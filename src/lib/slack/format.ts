import type { FinalAnswer } from "@/lib/answer/answer";

// Slack rendering of a validated answer. Slack auto-links and unfurls URLs
// (its servers fetch them), so any URL in model text that isn't our own app is
// removed: a poisoned document must not be able to trigger an exfiltration
// fetch through a link preview.

export function stripForeignUrls(text: string, appUrl: string): string {
  return text.replace(/https?:\/\/[^\s)>\]]+/g, (url) => (url.startsWith(appUrl) ? url : "[link removed]"));
}

/** Escapes Slack mrkdwn control characters so model text can't form links or mentions. */
export function escapeMrkdwn(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Numbered citations + a Sources list linking into the app (opened under the user's own login). */
export function formatAnswerMrkdwn(answer: FinalAnswer, appUrl: string): string {
  const order = new Map<string, number>();
  let body = "";
  for (const block of answer.blocks) {
    body += escapeMrkdwn(stripForeignUrls(block.text, appUrl));
    for (const c of block.citations) {
      if (!order.has(c.chunkId)) order.set(c.chunkId, order.size + 1);
      body += `[${order.get(c.chunkId)}]`;
    }
  }
  if (order.size === 0) return body;
  const sources = answer.sources
    .filter((s) => order.has(s.chunkId))
    .sort((a, b) => order.get(a.chunkId)! - order.get(b.chunkId)!)
    .map((s) => `${order.get(s.chunkId)}. <${appUrl}/documents/${s.documentId}?chunk=${s.chunkId}|${escapeMrkdwn(s.title)}>`);
  return `${body}\n\n*Sources*\n${sources.join("\n")}`;
}
