import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { adminRoute } from "@/lib/admin-route";
import { readJson } from "@/lib/http";
import { configSchemas, getConfig, setConfig, type ConfigKey } from "@/lib/config";
import { LANGUAGE_CODES } from "@/lib/languages";
import { missingConfiguration, widgetAllowedOrigins } from "@/lib/env";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const KEYS = Object.keys(configSchemas) as ConfigKey[];

export const GET = adminRoute("VIEWER", async () => {
  const entries = await Promise.all(KEYS.map(async (k) => [k, await getConfig(k)] as const));
  const suggestedQuestions = await prisma.suggestedQuestion.findMany({ orderBy: [{ position: "asc" }, { language: "asc" }] });
  return NextResponse.json({
    config: Object.fromEntries(entries),
    suggestedQuestions,
    missingConfiguration: missingConfiguration(),
    widgetAllowedOrigins: widgetAllowedOrigins(),
  });
});

const patchSchema = z.union([
  z.object({ key: z.enum(KEYS as [ConfigKey, ...ConfigKey[]]), value: z.unknown() }).strict(),
  z
    .object({
      suggestedQuestions: z
        .array(
          z.object({
            position: z.number().int().min(1).max(8),
            language: z.enum(LANGUAGE_CODES),
            text: z.string().trim().max(200),
            enabled: z.boolean().default(true),
          }),
        )
        .max(8 * LANGUAGE_CODES.length),
    })
    .strict(),
]);

/** PATCH /api/admin/settings - update one configuration section or the suggested questions. */
export const PATCH = adminRoute("ADMIN", async (req, user) => {
  const body = await readJson(req, patchSchema, 128 * 1024);
  if ("key" in body) {
    const value = await setConfig(body.key, body.value);
    await audit(user.id, "settings_updated", "SystemConfiguration", body.key);
    return NextResponse.json({ key: body.key, value });
  }
  await prisma.$transaction(async (tx) => {
    for (const q of body.suggestedQuestions) {
      if (!q.text) {
        await tx.suggestedQuestion.deleteMany({ where: { position: q.position, language: q.language } });
        continue;
      }
      await tx.suggestedQuestion.upsert({
        where: { position_language: { position: q.position, language: q.language } },
        create: q,
        update: { text: q.text, enabled: q.enabled },
      });
    }
  });
  await audit(user.id, "suggested_questions_updated", "SuggestedQuestion", null, { count: body.suggestedQuestions.length });
  return NextResponse.json({ ok: true });
});
