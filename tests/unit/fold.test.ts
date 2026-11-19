import { describe, expect, it } from "vitest";
import { foldTurkish } from "@/lib/text/fold";

describe("foldTurkish", () => {
  it("uses Turkish casing rules for I/İ before folding", () => {
    expect(foldTurkish("IĞDIR")).toBe("igdir");
    expect(foldTurkish("İSTANBUL")).toBe("istanbul");
  });

  it("makes diacritic-free queries match diacritic text", () => {
    expect(foldTurkish("Şirket çalışanları yıllık izin günü")).toBe(foldTurkish("sirket calisanlari yillik izin gunu"));
  });

  it("collapses whitespace", () => {
    expect(foldTurkish("  a \n\t b ")).toBe("a b");
  });
});
