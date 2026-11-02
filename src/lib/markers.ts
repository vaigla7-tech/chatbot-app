/** Control markers the model may emit. Safe to import in browser code. */
export const CONTROL = {
  noAnswer: "NO_ANSWER",
  conflict: "[CONFLICT]",
  escalate: "[ESCALATE]",
} as const;

/** Hide markers while a response is still streaming (used by the browser). */
export function cleanStreamingText(partial: string): string {
  let text = partial
    .replace(/\[S\d{1,2}\]/g, "")
    .replaceAll(CONTROL.conflict, "")
    .replaceAll(CONTROL.escalate, "");
  // Hide a marker that is only partially streamed, e.g. "[S" or "[ESCAL".
  text = text.replace(/\[[A-Z0-9]{0,9}$/, "");
  if (text.trim().length > 0 && CONTROL.noAnswer.startsWith(text.trim())) return "";
  return text;
}
