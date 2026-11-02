import { z } from "zod";
import { prisma } from "./db";
import { env } from "./env";
import { resolveSettings } from "./ai/capabilities";
import type { GenerationSettings, ProviderName } from "./ai/types";
import { LANGUAGE_CODES, type LanguageCode } from "./languages";

/** Typed, validated system configuration stored in the SystemConfiguration table. */
export const configSchemas = {
  support: z.object({
    contactUrl: z.string().url().nullable().default(null),
    requestUrl: z.string().url().nullable().default(null),
    email: z.string().email().nullable().default(null),
  }),
  branding: z.object({
    logoUrl: z.string().max(500).default("/brand/lendermarket-logo-black.svg"),
    logoDarkUrl: z.string().max(500).default("/brand/lendermarket-logo-white.svg"),
    markUrl: z.string().max(500).default("/brand/lendermarket-logomark.svg"),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#8550F6"),
    textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#241559"),
    privacyPolicyUrl: z.string().url().nullable().default(null),
  }),
  welcome: z.record(z.enum(LANGUAGE_CODES), z.string().max(500)).default({}),
  chat: z.object({
    maxMessageLength: z.number().int().min(100).max(4000).default(1500),
    maxHistoryMessages: z.number().int().min(0).max(30).default(10),
    systemPromptAddendum: z.string().max(4000).default(""),
    minRelevance: z.number().min(0).max(1).default(0.3),
    rateLimitPerMinute: z.number().int().min(1).max(600).nullable().default(null),
    rateLimitPerDay: z.number().int().min(1).max(100_000).nullable().default(null),
  }),
  analytics: z.object({
    retentionDays: z.number().int().min(1).max(3650).default(180),
    feedbackEnabled: z.boolean().default(true),
  }),
  languages: z.object({
    enabled: z.array(z.enum(LANGUAGE_CODES)).min(1).default([...LANGUAGE_CODES]),
  }),
} as const;

export type ConfigKey = keyof typeof configSchemas;
export type ConfigValue<K extends ConfigKey> = z.infer<(typeof configSchemas)[K]>;

const cache = new Map<string, { value: unknown; at: number }>();
const TTL_MS = 15_000;

export async function getConfig<K extends ConfigKey>(key: K): Promise<ConfigValue<K>> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as ConfigValue<K>;
  const row = await prisma.systemConfiguration.findUnique({ where: { key } });
  const parsed = configSchemas[key].safeParse(row?.value ?? {});
  const value = (parsed.success ? parsed.data : configSchemas[key].parse({})) as ConfigValue<K>;
  cache.set(key, { value, at: Date.now() });
  return value;
}

export async function setConfig<K extends ConfigKey>(key: K, value: unknown): Promise<ConfigValue<K>> {
  const parsed = configSchemas[key].parse(value) as ConfigValue<K>;
  await prisma.systemConfiguration.upsert({
    where: { key },
    create: { key, value: parsed as object },
    update: { value: parsed as object },
  });
  cache.delete(key);
  return parsed;
}

export function clearConfigCache() {
  cache.clear();
}

export interface ActiveModels {
  primary: GenerationSettings;
  fallback: GenerationSettings | null;
}

/** Active model from the admin configuration, falling back to AI_PROVIDER / AI_MODEL. */
export async function getActiveModels(): Promise<ActiveModels> {
  const configs = await prisma.aIProviderConfig.findMany({
    where: { enabled: true, OR: [{ active: true }, { isFallback: true }] },
  });
  const active = configs.find((c) => c.active);
  const fallback = configs.find((c) => c.isFallback && !c.active);
  const e = env();
  const primary = active
    ? resolveSettings(active.providerName as ProviderName, active.modelName, active.settings)
    : resolveSettings(e.AI_PROVIDER ?? "anthropic", e.AI_MODEL ?? "claude-opus-5-5", {});
  return {
    primary,
    fallback: fallback ? resolveSettings(fallback.providerName as ProviderName, fallback.modelName, fallback.settings) : null,
  };
}

export async function getSuggestedQuestions(language: LanguageCode): Promise<string[]> {
  const rows = await prisma.suggestedQuestion.findMany({
    where: { enabled: true, language: { in: [language, "en"] } },
    orderBy: { position: "asc" },
  });
  const byPosition = new Map<number, string>();
  for (const row of rows) {
    if (row.language === language || !byPosition.has(row.position)) byPosition.set(row.position, row.text);
  }
  return [...byPosition.values()];
}
