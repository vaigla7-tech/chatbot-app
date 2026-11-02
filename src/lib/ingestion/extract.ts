import type { FileKind } from "./file-types";

export interface ExtractedSection {
  text: string;
  pageNumber: number | null;
}

/** Normalise extracted text: Unicode NFC, strip control characters, join hyphenated line breaks. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/(\p{L})-\n(\p{Ll})/gu, "$1$2")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractText(kind: FileKind, data: Buffer): Promise<ExtractedSection[]> {
  switch (kind) {
    case "pdf": {
      const { extractText: extractPdf, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(data));
      const { text } = await extractPdf(pdf, { mergePages: false });
      return text.map((pageText, i) => ({ text: normalizeText(pageText), pageNumber: i + 1 }));
    }
    case "docx": {
      const mammoth = await import("mammoth");
      const { load } = await import("cheerio");
      const { value: html } = await mammoth.convertToHtml({ buffer: data });
      const $ = load(html);
      const lines: string[] = [];
      $("h1, h2, h3, h4, p, li, td").each((_, el) => {
        const tag = el.tagName.toLowerCase();
        const text = $(el).text().trim();
        if (!text) return;
        if (tag.startsWith("h")) lines.push(`\n${"#".repeat(Number(tag[1]))} ${text}`);
        else if (tag === "li") lines.push(`- ${text}`);
        else lines.push(text);
      });
      return [{ text: normalizeText(lines.join("\n")), pageNumber: null }];
    }
    case "csv": {
      const Papa = (await import("papaparse")).default;
      const parsed = Papa.parse<Record<string, string>>(data.toString("utf8"), { header: true, skipEmptyLines: true });
      const rows = parsed.data.map((row) =>
        Object.entries(row)
          .filter(([, v]) => v && String(v).trim())
          .map(([k, v]) => `${k}: ${String(v).trim()}`)
          .join("\n"),
      );
      return [{ text: normalizeText(rows.join("\n\n")), pageNumber: null }];
    }
    case "txt":
    case "md":
      return [{ text: normalizeText(data.toString("utf8")), pageNumber: null }];
  }
}
