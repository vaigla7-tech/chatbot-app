import type { ExtractedSection } from "./extract";

export interface Chunk {
  content: string;
  heading: string | null;
  pageNumber: number | null;
}

const HEADING = /^(#{1,4})\s+(.+)$/;

function splitLong(paragraph: string, max: number): string[] {
  if (paragraph.length <= max) return [paragraph];
  const sentences = paragraph.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [paragraph];
  const parts: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > max) {
      parts.push(current.trim());
      current = "";
    }
    if (sentence.length > max) {
      for (let i = 0; i < sentence.length; i += max) parts.push(sentence.slice(i, i + max).trim());
    } else current += sentence;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * Split extracted sections into retrieval chunks of roughly `targetChars`,
 * respecting paragraph boundaries, carrying the nearest heading and page number,
 * and overlapping the last paragraph to preserve context across chunk edges.
 */
export function chunkSections(sections: ExtractedSection[], targetChars = 1200, maxChars = 1800): Chunk[] {
  const chunks: Chunk[] = [];
  let heading: string | null = null;

  for (const section of sections) {
    let buffer: string[] = [];
    let size = 0;
    const flush = (keepOverlap: boolean) => {
      const content = buffer.join("\n\n").trim();
      if (content.length >= 20) {
        chunks.push({ content: heading && !content.startsWith(heading) ? `${heading}\n\n${content}` : content, heading, pageNumber: section.pageNumber });
      }
      const last = buffer[buffer.length - 1];
      buffer = keepOverlap && last && last.length < targetChars / 3 ? [last] : [];
      size = buffer.reduce((n, p) => n + p.length, 0);
    };

    for (const raw of section.text.split(/\n{2,}|\n(?=#{1,4}\s)/)) {
      const paragraph = raw.trim();
      if (!paragraph) continue;
      const firstLine = paragraph.split("\n")[0] ?? "";
      const match = HEADING.exec(firstLine);
      if (match) {
        if (size > 0) flush(false);
        heading = match[2]!.trim();
        const rest = paragraph.split("\n").slice(1).join("\n").trim();
        if (!rest) continue;
        for (const piece of splitLong(rest, maxChars)) {
          buffer.push(piece);
          size += piece.length;
        }
        continue;
      }
      for (const piece of splitLong(paragraph, maxChars)) {
        if (size + piece.length > targetChars && size > 0) flush(true);
        buffer.push(piece);
        size += piece.length;
      }
    }
    if (size > 0) flush(false);
  }
  return chunks;
}
