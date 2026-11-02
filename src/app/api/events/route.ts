import { NextResponse } from "next/server";
import { z } from "zod";
import { recordEvent } from "@/lib/analytics";
import { LANGUAGE_CODES } from "@/lib/languages";
import { clientKey, getLimiter } from "@/lib/rate-limit";
import { handleRouteError, jsonError, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("session_start"),
    anonSessionId: z.string().regex(/^[a-zA-Z0-9-]{8,64}$/),
    language: z.enum(LANGUAGE_CODES),
  }),
  z.object({
    type: z.literal("feedback"),
    anonSessionId: z.string().regex(/^[a-zA-Z0-9-]{8,64}$/),
    language: z.enum(LANGUAGE_CODES),
    value: z.union([z.literal(1), z.literal(-1)]),
  }),
]);

/** POST /api/events - anonymous session-start and feedback signals (no message content). */
export async function POST(req: Request) {
  try {
    if (!getLimiter("events", 30, 60_000).check(clientKey(req.headers)).allowed) {
      return jsonError("rate_limited", "Too many requests. Please try again later.");
    }
    const body = await readJson(req, schema, 1024);
    await recordEvent({
      anonSessionId: body.anonSessionId,
      language: body.language,
      eventType: body.type === "session_start" ? "SESSION_START" : "FEEDBACK",
      feedback: body.type === "feedback" ? body.value : null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
