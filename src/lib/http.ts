import { NextResponse } from "next/server";
import { ZodError, type ZodTypeAny, type output } from "zod";
import { isDatabaseUnavailable } from "./db";

export type ErrorCode =
  | "bad_request"
  | "validation_error"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "payload_too_large"
  | "rate_limited"
  | "database_unavailable"
  | "ai_unavailable"
  | "internal_error";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  validation_error: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  rate_limited: 429,
  database_unavailable: 503,
  ai_unavailable: 503,
  internal_error: 500,
};

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Consistent JSON error envelope: { error: { code, message, details? } } */
export function jsonError(code: ErrorCode, message: string, details?: unknown, headers?: HeadersInit) {
  return NextResponse.json(
    { error: { code, message, ...(details !== undefined ? { details } : {}) } },
    { status: STATUS[code], headers },
  );
}

/** Convert any thrown value into a safe JSON error. Never leaks stack traces. */
export function handleRouteError(error: unknown) {
  if (error instanceof ApiError) return jsonError(error.code, error.message, error.details);
  if (error instanceof ZodError) {
    return jsonError(
      "validation_error",
      "Invalid request",
      error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  if (isDatabaseUnavailable(error)) return jsonError("database_unavailable", "Database temporarily unavailable");
  const prismaCode = (error as { code?: string } | null)?.code;
  if (prismaCode === "P2002") return jsonError("conflict", "A record with these values already exists");
  if (prismaCode === "P2025") return jsonError("not_found", "Record not found");
  if (prismaCode === "P2003") return jsonError("conflict", "Record is still referenced by other records");
  console.error("[api] unhandled error:", error instanceof Error ? error.message : "unknown");
  return jsonError("internal_error", "Internal server error");
}

/** Read and validate a JSON body with an upper size bound. */
export async function readJson<S extends ZodTypeAny>(req: Request, schema: S, maxBytes = 64 * 1024): Promise<output<S>> {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > maxBytes) throw new ApiError("payload_too_large", "Request body too large");
  const text = await req.text();
  if (Buffer.byteLength(text) > maxBytes) throw new ApiError("payload_too_large", "Request body too large");
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError("bad_request", "Body must be valid JSON");
  }
  return schema.parse(data);
}
