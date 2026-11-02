import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { LANGUAGE_CODES } from "@/lib/languages";
import { clientKey, getLimiter } from "@/lib/rate-limit";
import { handleRouteError, jsonError, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

// Only predefined codes are accepted - never free text or personal data.
const schema = z
  .object({
    action: z.enum(["offered", "contact", "request"]),
    reasonCode: z.enum([
      "account_specific",
      "withdrawal_issue",
      "kyc_issue",
      "complaint",
      "no_information",
      "conflicting_sources",
      "model_requested",
      "user_requested",
    ]),
    category: z.string().regex(/^[a-z-]{1,40}$/).nullable().default(null),
    language: z.enum(LANGUAGE_CODES).nullable().default(null),
  })
  .strict();

/** POST /api/escalations - records the escalation and returns the official destination. */
export async function POST(req: Request) {
  try {
    if (!getLimiter("escalation", 20, 60_000).check(clientKey(req.headers)).allowed) {
      return jsonError("rate_limited", "Too many requests. Please try again later.");
    }
    const body = await readJson(req, schema, 2048);
    const support = await getConfig("support");
    const destination =
      body.action === "request"
        ? support.requestUrl ?? support.contactUrl ?? (support.email ? `mailto:${support.email}` : null)
        : support.contactUrl ?? (support.email ? `mailto:${support.email}` : null);
    await prisma.escalationEvent.create({
      data: {
        category: body.category,
        reasonCode: body.reasonCode,
        language: body.language,
        destinationType: destination?.startsWith("mailto:") ? "email" : "link",
        status: body.action === "offered" ? "offered" : "clicked",
      },
    });
    return NextResponse.json({ destination, configured: destination !== null });
  } catch (error) {
    return handleRouteError(error);
  }
}
