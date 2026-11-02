/** Accepted knowledge document formats with magic-byte validation. */
export const ACCEPTED_TYPES = {
  pdf: { mime: "application/pdf", label: "PDF" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word (DOCX)" },
  csv: { mime: "text/csv", label: "CSV" },
  txt: { mime: "text/plain", label: "Text" },
  md: { mime: "text/markdown", label: "Markdown" },
} as const;

export type FileKind = keyof typeof ACCEPTED_TYPES;

export const ACCEPTED_EXTENSIONS = Object.keys(ACCEPTED_TYPES).map((k) => `.${k}`);

export class InvalidFileError extends Error {}

function isUtf8Text(data: Buffer): boolean {
  if (data.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(data);
    return true;
  } catch {
    return false;
  }
}

/** Determine the file kind from its extension AND its content; throws on mismatch. */
export function detectFileKind(fileName: string, data: Buffer): FileKind {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const kind = (ext === "markdown" ? "md" : ext) as FileKind;
  if (!(kind in ACCEPTED_TYPES)) {
    throw new InvalidFileError(`Unsupported file type. Accepted: ${ACCEPTED_EXTENSIONS.join(", ")}`);
  }
  if (data.byteLength === 0) throw new InvalidFileError("The file is empty");
  if (kind === "pdf" && data.subarray(0, 5).toString("latin1") !== "%PDF-") throw new InvalidFileError("File content is not a valid PDF");
  if (kind === "docx" && !(data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04))
    throw new InvalidFileError("File content is not a valid DOCX document");
  if ((kind === "csv" || kind === "txt" || kind === "md") && !isUtf8Text(data))
    throw new InvalidFileError("Text files must be UTF-8 encoded");
  return kind;
}

/**
 * Basic unsafe-content screening. This is not an antivirus scan; it rejects
 * active content that has no place in investor documentation.
 */
export function screenUnsafeContent(kind: FileKind, data: Buffer): string | null {
  if (kind === "pdf") {
    const head = data.toString("latin1");
    if (/\/(JavaScript|JS|Launch|EmbeddedFile|OpenAction\s*<<[^>]*\/JS)\b/.test(head)) {
      return "PDF contains active content (JavaScript, launch actions or embedded files)";
    }
  }
  if (kind === "docx" && data.toString("latin1").includes("vbaProject.bin")) {
    return "Document contains macros";
  }
  return null;
}
