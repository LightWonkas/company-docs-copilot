// Turkish-aware ASCII folding for the trigram leg. Done in the app (not with
// DB locale/unaccent) so indexing and querying fold identically everywhere.
//
// Lowercase with the tr-TR locale first: "I" -> "ı" and "İ" -> "i" are
// Turkish-specific and a plain toLowerCase() gets them wrong.
const FOLD: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  â: "a",
  î: "i",
  û: "u",
};

export function foldTurkish(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşüâîû]/g, (ch) => FOLD[ch])
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
