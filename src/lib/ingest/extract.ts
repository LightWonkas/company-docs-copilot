// File bytes -> Markdown. Everything downstream (hygiene, chunking) works on
// Markdown so headings and tables survive for all three formats.

export type SourceKind = "pdf" | "docx" | "markdown";

export function kindFromName(fileName: string): SourceKind {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "md" || ext === "markdown" || ext === "txt") return "markdown";
  throw new Error(`Unsupported file type: ${fileName}`);
}

export const MIME_TYPES: Record<SourceKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  markdown: "text/markdown",
};

export async function extractMarkdown(bytes: Uint8Array, kind: SourceKind): Promise<string> {
  switch (kind) {
    case "markdown":
      return new TextDecoder("utf-8").decode(bytes);
    case "pdf": {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(bytes);
      const { text } = await extractText(pdf, { mergePages: false });
      // PDFs carry no heading structure; pages become paragraphs and the
      // chunker falls back to paragraph boundaries.
      return text.map((page) => page.trim()).filter(Boolean).join("\n\n");
    }
    case "docx": {
      const mammoth = (await import("mammoth")).default;
      const { value: html } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
      const TurndownService = (await import("turndown")).default;
      const { gfm } = await import("turndown-plugin-gfm");
      const turndown = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" });
      turndown.use(gfm); // keeps tables as Markdown tables
      return turndown.turndown(html);
    }
  }
}
