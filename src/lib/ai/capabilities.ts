import { z } from "zod";
import type { Effort, GenerationSettings, ProviderName } from "./types";

/**
 * Which tunable parameters a provider/model accepts. The admin UI only shows
 * parameters listed here, and the server strips anything else.
 */
export interface ModelCapabilities {
  temperature: boolean;
  effort: boolean;
  maxOutputTokensLimit: number;
}

const ANTHROPIC_EFFORT_MODEL = /^claude-(opus|sonnet|haiku|fable|mythos)-(4-[5-9]|5)/;
const OPENAI_REASONING_MODEL = /^(o\d|gpt-5)/;

export function modelCapabilities(provider: ProviderName, model: string): ModelCapabilities {
  if (provider === "anthropic") {
    // Current Claude models reject sampling parameters (temperature/top_p); depth is set with effort.
    return { temperature: false, effort: ANTHROPIC_EFFORT_MODEL.test(model), maxOutputTokensLimit: 32_000 };
  }
  const reasoning = OPENAI_REASONING_MODEL.test(model);
  return { temperature: !reasoning, effort: reasoning, maxOutputTokensLimit: 32_000 };
}

export const MODEL_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:\-/]{1,99}$/;

export const storedSettingsSchema = z
  .object({
    temperature: z.number().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().min(64).max(32_000).optional(),
    effort: z.enum(["low", "medium", "high"]).optional(),
    timeoutMs: z.number().int().min(5_000).max(120_000).optional(),
  })
  .strict();

export type StoredSettings = z.infer<typeof storedSettingsSchema>;

export const DEFAULT_SETTINGS = { maxOutputTokens: 1_500, timeoutMs: 45_000, effort: "low" as Effort };

/** Merge stored settings with defaults and drop anything the model does not support. */
export function resolveSettings(provider: ProviderName, model: string, stored: unknown): GenerationSettings {
  const parsed = storedSettingsSchema.safeParse(stored ?? {});
  const s = parsed.success ? parsed.data : {};
  const caps = modelCapabilities(provider, model);
  return {
    provider,
    model,
    maxOutputTokens: Math.min(s.maxOutputTokens ?? DEFAULT_SETTINGS.maxOutputTokens, caps.maxOutputTokensLimit),
    timeoutMs: s.timeoutMs ?? DEFAULT_SETTINGS.timeoutMs,
    ...(caps.temperature && s.temperature !== undefined ? { temperature: s.temperature } : {}),
    ...(caps.effort ? { effort: s.effort ?? DEFAULT_SETTINGS.effort } : {}),
  };
}
