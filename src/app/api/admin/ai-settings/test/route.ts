import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute } from "@/lib/admin-route";
import { readJson } from "@/lib/http";
import { getAdapter } from "@/lib/ai/registry";
import { ProviderError, PROVIDER_NAMES, type ProviderName } from "@/lib/ai/types";
import { MODEL_ID_PATTERN, resolveSettings, storedSettingsSchema } from "@/lib/ai/capabilities";
import { getLimiter } from "@/lib/rate-limit";
import { recordOperationalError } from "@/lib/analytics";
import { ApiError } from "@/lib/http";

export const dynamic = "force-dynamic";

const schema = z.object({
  providerName: z.enum(PROVIDER_NAMES as [ProviderName, ...ProviderName[]]),
  modelName: z.string().regex(MODEL_ID_PATTERN),
  settings: storedSettingsSchema.default({}),
});

/** POST /api/admin/ai-settings/test - send a tiny prompt to verify credentials and model access. */
export const POST = adminRoute("ADMIN", async (req, user) => {
  if (!getLimiter("ai-test", 10, 60_000).check(user.id).allowed) throw new ApiError("rate_limited", "Too many test requests");
  const body = await readJson(req, schema);
  const settings = { ...resolveSettings(body.providerName, body.modelName, body.settings), maxOutputTokens: 64, timeoutMs: 30_000 };
  const started = Date.now();
  try {
    const result = await getAdapter(body.providerName).generate({
      system: "You are a connectivity check. Reply with the single word OK.",
      messages: [{ role: "user", content: "Connectivity check" }],
      settings,
    });
    return NextResponse.json({
      ok: !result.refused,
      latencyMs: Date.now() - started,
      model: result.model,
      reply: result.text.slice(0, 50),
      usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
    });
  } catch (error) {
    const pe = error instanceof ProviderError ? error : null;
    await recordOperationalError({ source: "ai-test", provider: body.providerName, code: pe?.code ?? "unknown", message: pe?.message ?? "Test failed" });
    return NextResponse.json({ ok: false, latencyMs: Date.now() - started, error: { code: pe?.code ?? "unknown", message: pe?.message ?? "Test failed" } });
  }
});
