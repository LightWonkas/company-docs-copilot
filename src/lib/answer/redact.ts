import { createHash } from "node:crypto";

// Audit rows keep a redacted query plus a hash of the original: enough to
// count repeats and investigate, without storing personal data verbatim.
const RULES: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]"],
  [/\bTR\d{2}(?:\s?\d{4}){5}\s?\d{2}\b/gi, "[iban]"],
  [/\b(?:\d[ -]?){15,16}\b/g, "[card]"],
  [/\b[1-9]\d{10}\b/g, "[tc_kimlik]"],
  [/(?:\+90|0)\s?\(?5\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/g, "[phone]"],
];

export function redactQuery(query: string): string {
  return RULES.reduce((q, [re, label]) => q.replace(re, label), query).slice(0, 2000);
}

export function queryHash(query: string): string {
  return createHash("sha256").update(query.trim().toLocaleLowerCase("tr-TR")).digest("hex");
}
