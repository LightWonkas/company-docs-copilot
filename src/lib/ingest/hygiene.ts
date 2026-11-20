// Ingest-time injection hygiene (OWASP LLM01 / LLM08). Two jobs:
//  1. Remove content a human reader would never see (zero-width characters,
//     HTML comments, CSS-hidden spans) so it is neither indexed nor sent to a
//     model, and record that the document tried to hide something.
//  2. A cheap, deterministic pattern screen for instruction-like text. The
//     LLM screen (screen.ts) runs on top; either one flags a chunk.

const ZERO_WIDTH = /[​-‍⁠﻿­]/g;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
// Elements styled to be invisible: white text, display:none, zero size/opacity.
const HIDDEN_ELEMENT =
  /<(span|div|p|font)\b[^>]*style\s*=\s*["'][^"']*(?:color\s*:\s*(?:#f{3}(?:f{3})?\b|white|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))|display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?:px|pt|em)?\b|opacity\s*:\s*0(?:\.0+)?\b)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi;
const HTML_TAG = /<\/?[a-z][^>]*>/gi;

export type HygieneResult = { text: string; flags: string[] };

export function sanitizeHidden(markdown: string): HygieneResult {
  const flags: string[] = [];
  let text = markdown;
  if (ZERO_WIDTH.test(text)) flags.push("hidden:zero_width");
  text = text.replace(ZERO_WIDTH, "");
  if (HTML_COMMENT.test(text)) flags.push("hidden:html_comment");
  text = text.replace(HTML_COMMENT, "");
  if (HIDDEN_ELEMENT.test(text)) flags.push("hidden:css");
  text = text.replace(HIDDEN_ELEMENT, "");
  // Remaining inline HTML: keep the visible text, drop the markup.
  text = text.replace(HTML_TAG, "");
  // Reset lastIndex on the global regexes used with .test().
  for (const re of [ZERO_WIDTH, HTML_COMMENT, HIDDEN_ELEMENT]) re.lastIndex = 0;
  return { text, flags };
}

// Instruction-like phrases in TR and EN. Deliberately conservative: a hit
// quarantines the chunk from answer context, it does not delete anything.
const PATTERNS: { flag: string; re: RegExp }[] = [
  { flag: "override", re: /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|all|earlier|your)\b[^.\n]{0,20}\b(instructions?|rules?|prompts?|guidelines)\b/i },
  // \p{L} (not \w) so Turkish letters like ı/ş match inside words.
  { flag: "override", re: /(önceki|yukarıdaki|tüm|bütün)\s+(talimat|kural|yönerge)\p{L}*\s+(yok\s*say|görmezden\s*gel|unut|dikkate\s*alma)/iu },
  { flag: "fake_system", re: /(^|\n)\s*(\[?\s*(system|developer|assistant)\s*(message|prompt|note)?\s*\]?\s*:|<\/?(system|developer)>)/i },
  { flag: "fake_system", re: /\b(sistem|geliştirici)\s+(mesajı|talimatı|notu)\s*:/i },
  { flag: "role_escalation", re: /\b(you are now|act as|pretend to be|from now on you)\b/i },
  { flag: "role_escalation", re: /\b(artık sen|bundan sonra sen|rolünü üstlen)\b/i },
  { flag: "exfil_markdown_image", re: /!\[[^\]]*\]\(\s*https?:\/\/[^)\s]+\?[^)\s]*\)/i },
  { flag: "exfil_link", re: /\[[^\]]+\]\(\s*https?:\/\/[^)\s]*(exfil|collect|log|track|login|reset)[^)\s]*\)/i },
  // Requests to reveal secrets, not the presence of a control number itself:
  // restricted docs legitimately contain their own document control number.
  { flag: "secret_fishing", re: /\b(list|print|reveal|output|show|repeat|include)\b[^.\n]{0,80}\b(CANARY|canary tokens?|control numbers?|secret tokens?)/i },
  // Turkish puts the verb last: "... kontrol numaralarını listele".
  { flag: "secret_fishing", re: /(CANARY|kontrol (no|numara)\p{L}*)[^.\n]{0,60}(listele|yaz|göster|paylaş)/iu },
  // Chat-template special tokens have no business in a business document.
  { flag: "chat_template_token", re: /<\|[a-z_]{2,30}\|>|\[\/?INST\]|<(start|end)_of_turn>/i },
  { flag: "fake_tool_call", re: /<\/?(function_calls|invoke|tool_use|antml)[^>]*>|"tool_calls?"\s*:/i },
  { flag: "encoded_payload", re: /\b(base64|decode (this|the following|it))\b[\s\S]{0,250}[A-Za-z0-9+/]{40,}={0,2}/i },
  { flag: "citation_manipulation", re: /\b(always|only) cite (this|me)\b|\bher zaman bu (belgeyi|dokümanı) (kaynak|referans)/i },
  { flag: "refusal_suppression", re: /\b(do not|never|don't) (refuse|mention|say you can't|add disclaimers)\b|\b(asla )?reddetme\b/i },
];

export function screenPatterns(text: string): string[] {
  const hits = new Set<string>();
  for (const { flag, re } of PATTERNS) if (re.test(text)) hits.add(`pattern:${flag}`);
  return [...hits];
}
