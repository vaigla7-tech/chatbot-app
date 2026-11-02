import { chatRequestSchema, runChatTurn, type ChatEvent } from "@/lib/chat-service";
import { clientKey, getLimiter } from "@/lib/rate-limit";
import { env } from "@/lib/env";
import { getConfig } from "@/lib/config";
import { handleRouteError, jsonError, readJson } from "@/lib/http";
import { t } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/chat - streams newline-delimited JSON events:
 *   {"type":"meta"} → {"type":"delta"}* → {"type":"done"} | {"type":"error"}
 * The conversation is never persisted; the client sends its in-memory history.
 */
export async function POST(req: Request) {
  try {
    const key = clientKey(req.headers);
    const chatConfig = await getConfig("chat").catch(() => null);
    const perMinute = chatConfig?.rateLimitPerMinute ?? env().CHAT_RATE_LIMIT_PER_MINUTE ?? 12;
    const perDay = chatConfig?.rateLimitPerDay ?? env().CHAT_RATE_LIMIT_PER_DAY ?? 300;
    for (const [name, limit, window] of [
      ["chat-minute", perMinute, 60_000],
      ["chat-day", perDay, 86_400_000],
    ] as const) {
      const verdict = getLimiter(name, limit, window).check(key);
      if (!verdict.allowed) {
        const lang = req.headers.get("accept-language")?.slice(0, 2) ?? "en";
        return jsonError("rate_limited", t(lang, "errors.rateLimit"), undefined, {
          "Retry-After": String(verdict.retryAfterSeconds),
        });
      }
    }

    const body = await readJson(req, chatRequestSchema, 96 * 1024);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: ChatEvent) => {
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          } catch {
            // client disconnected
          }
        };
        try {
          await runChatTurn(body, emit, req.signal);
        } catch (error) {
          console.error("[chat] turn failed:", error instanceof Error ? error.name : "unknown");
          emit({ type: "error", code: "internal_error", message: t(body.language ?? body.uiLanguage, "errors.generic") });
        } finally {
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
