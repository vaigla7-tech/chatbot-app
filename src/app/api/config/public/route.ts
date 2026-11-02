import { NextResponse } from "next/server";
import { getConfig, getSuggestedQuestions } from "@/lib/config";
import { LANGUAGES, LANGUAGE_CODES, isLanguageCode } from "@/lib/languages";
import { handleRouteError } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/config/public?lang=xx - only non-sensitive, investor-facing configuration. */
export async function GET(req: Request) {
  try {
    const param = new URL(req.url).searchParams.get("lang");
    const lang = isLanguageCode(param) ? param : "en";
    const [branding, support, welcome, languages, analytics, suggested] = await Promise.all([
      getConfig("branding"),
      getConfig("support"),
      getConfig("welcome"),
      getConfig("languages"),
      getConfig("analytics"),
      getSuggestedQuestions(lang),
    ]);
    const chat = await getConfig("chat");
    return NextResponse.json(
      {
        branding,
        languages: LANGUAGE_CODES.filter((c) => languages.enabled.includes(c)).map((code) => ({
          code,
          nativeName: LANGUAGES[code].nativeName,
        })),
        welcomeMessage: welcome[lang] ?? null,
        suggestedQuestions: suggested,
        support: {
          contactUrl: support.contactUrl,
          requestUrl: support.requestUrl,
          email: support.email,
        },
        feedbackEnabled: analytics.feedbackEnabled,
        maxMessageLength: chat.maxMessageLength,
      },
      { headers: { "Cache-Control": "public, max-age=30" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
