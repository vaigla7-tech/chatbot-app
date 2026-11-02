import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { adminRoute } from "@/lib/admin-route";
import { ApiError, readJson } from "@/lib/http";
import { getAdapter } from "@/lib/ai/registry";
import { PROVIDER_NAMES, type ProviderName } from "@/lib/ai/types";
import { MODEL_ID_PATTERN, modelCapabilities, resolveSettings, storedSettingsSchema } from "@/lib/ai/capabilities";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = adminRoute("VIEWER", async () => {
  const configs = await prisma.aIProviderConfig.findMany({ orderBy: [{ active: "desc" }, { providerName: "asc" }, { modelName: "asc" }] });
  const errors = await prisma.operationalError.findMany({
    where: { source: { in: ["chat", "ai-test"] } },
    orderBy: { timestamp: "desc" },
    take: 20,
  });
  return NextResponse.json({
    providers: PROVIDER_NAMES.map((name) => ({ name, configured: getAdapter(name).isConfigured() })),
    configs: configs.map((c) => ({
      ...c,
      capabilities: modelCapabilities(c.providerName as ProviderName, c.modelName),
      effective: resolveSettings(c.providerName as ProviderName, c.modelName, c.settings),
    })),
    recentErrors: errors,
  });
});

const providerSchema = z.enum(PROVIDER_NAMES as [ProviderName, ...ProviderName[]]);

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("upsert"),
    id: z.string().max(40).optional(),
    providerName: providerSchema,
    modelName: z.string().regex(MODEL_ID_PATTERN, "Invalid model identifier"),
    enabled: z.boolean().default(true),
    settings: storedSettingsSchema.default({}),
  }),
  z.object({ action: z.literal("activate"), id: z.string().max(40) }),
  z.object({ action: z.literal("setFallback"), id: z.string().max(40).nullable() }),
  z.object({ action: z.literal("delete"), id: z.string().max(40) }),
]);

/** PATCH /api/admin/ai-settings - manage model configurations, the active model and the fallback. */
export const PATCH = adminRoute("ADMIN", async (req, user) => {
  const body = await readJson(req, actionSchema);
  switch (body.action) {
    case "upsert": {
      const caps = modelCapabilities(body.providerName, body.modelName);
      // Strip parameters the model does not support.
      const settings = {
        ...(body.settings.maxOutputTokens ? { maxOutputTokens: Math.min(body.settings.maxOutputTokens, caps.maxOutputTokensLimit) } : {}),
        ...(body.settings.timeoutMs ? { timeoutMs: body.settings.timeoutMs } : {}),
        ...(caps.temperature && body.settings.temperature !== undefined ? { temperature: body.settings.temperature } : {}),
        ...(caps.effort && body.settings.effort ? { effort: body.settings.effort } : {}),
      };
      const data = { providerName: body.providerName, modelName: body.modelName, enabled: body.enabled, settings };
      const config = body.id
        ? await prisma.aIProviderConfig.update({ where: { id: body.id }, data })
        : await prisma.aIProviderConfig.create({ data });
      await audit(user.id, "ai_config_saved", "AIProviderConfig", config.id, { provider: body.providerName, model: body.modelName });
      return NextResponse.json({ config });
    }
    case "activate": {
      const target = await prisma.aIProviderConfig.findUnique({ where: { id: body.id } });
      if (!target || !target.enabled) throw new ApiError("conflict", "Only enabled configurations can be activated");
      await prisma.$transaction([
        prisma.aIProviderConfig.updateMany({ data: { active: false } }),
        prisma.aIProviderConfig.update({ where: { id: body.id }, data: { active: true, isFallback: false } }),
      ]);
      await audit(user.id, "ai_model_activated", "AIProviderConfig", body.id, { model: target.modelName });
      return NextResponse.json({ ok: true });
    }
    case "setFallback": {
      await prisma.$transaction([
        prisma.aIProviderConfig.updateMany({ data: { isFallback: false } }),
        ...(body.id ? [prisma.aIProviderConfig.update({ where: { id: body.id }, data: { isFallback: true } })] : []),
      ]);
      await audit(user.id, "ai_fallback_set", "AIProviderConfig", body.id);
      return NextResponse.json({ ok: true });
    }
    case "delete": {
      const target = await prisma.aIProviderConfig.findUnique({ where: { id: body.id } });
      if (target?.active) throw new ApiError("conflict", "Activate another model before deleting the active one");
      await prisma.aIProviderConfig.delete({ where: { id: body.id } });
      await audit(user.id, "ai_config_deleted", "AIProviderConfig", body.id);
      return NextResponse.json({ ok: true });
    }
  }
});
