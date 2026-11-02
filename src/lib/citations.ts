import { CONTROL } from "./markers";
import { PROMPT_CANARY } from "./prompt";

export interface ParsedAnswer {
  text: string;
  /** Distinct source keys actually cited, in order of first citation ([1], [2] …). */
  citedKeys: string[];
  noAnswer: boolean;
  conflict: boolean;
  escalate: boolean;
  leaked: boolean;
}

/**
 * Validate and normalise model output: keep only citations that reference real
 * retrieved sources, renumber them [1], [2] … in order of appearance, and
 * strip control markers.
 */
export function parseAnswer(raw: string, sourceKeys: string[]): ParsedAnswer {
  const trimmed = raw.trim();
  const leaked = trimmed.includes(PROMPT_CANARY);
  const noAnswer = trimmed === CONTROL.noAnswer || trimmed.replace(/[.\s]/g, "") === CONTROL.noAnswer || trimmed.length === 0;
  const conflict = trimmed.includes(CONTROL.conflict);
  const escalate = trimmed.includes(CONTROL.escalate);

  const order: string[] = [];
  let text = trimmed
    .replaceAll(CONTROL.conflict, "")
    .replaceAll(CONTROL.escalate, "")
    .replace(/(\s*)\[S(\d{1,2})\]/g, (_m, space: string, n: string) => {
      const key = sourceKeys[Number(n) - 1];
      if (key === undefined) return ""; // fabricated citation: drop it with its leading space
      if (!order.includes(key)) order.push(key);
      return `${space}[${order.indexOf(key) + 1}]`;
    });
  // Remove any remaining bracketed pseudo-citations the model may have produced.
  text = text
    .replace(/\[(?:source|S)\s*\d+\]/gi, "")
    .replace(/(\[\d+\])\1+/g, "$1").replace(/[ \t]+\n/g, "\n").replace(/ {2,}/g, " ").trim();

  return { text, citedKeys: order, noAnswer, conflict, escalate, leaked };
}
