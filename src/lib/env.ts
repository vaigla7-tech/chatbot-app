import { z } from "zod";

/**
 * Server-side environment access. Values are read lazily so that a missing
 * variable degrades one feature instead of crashing the whole app at boot.
 */
const schema = z.object({
  DATABASE_URL: z.string().optional(),
  APP_URL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_PROVIDER: z.enum(["anthropic", "openai"]).optional(),
  AI_MODEL: z.string().optional(),
  EMBEDDING_PROVIDER: z.enum(["openai", "none"]).optional(),
  EMBEDDING_MODEL: z.string().optional(),
  ADMIN_AUTH_SECRET: z.string().optional(),
  DOCUMENT_STORAGE: z.enum(["database", "s3"]).optional(),
  DOCUMENT_STORAGE_BUCKET: z.string().optional(),
  DOCUMENT_STORAGE_REGION: z.string().optional(),
  DOCUMENT_STORAGE_ENDPOINT: z.string().optional(),
  DOCUMENT_STORAGE_ACCESS_KEY_ID: z.string().optional(),
  DOCUMENT_STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  DOCUMENT_MAX_UPLOAD_MB: z.coerce.number().positive().optional(),
  WIDGET_ALLOWED_ORIGINS: z.string().optional(),
  WEBSITE_ALLOWED_HOSTS: z.string().optional(),
  CHAT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().optional(),
  CHAT_RATE_LIMIT_PER_DAY: z.coerce.number().int().positive().optional(),
});

export type Env = z.infer<typeof schema>;

function blankToUndefined(source: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(source)) out[k] = v === "" ? undefined : v;
  return out;
}

export function env(): Env {
  const parsed = schema.safeParse(blankToUndefined(process.env));
  if (parsed.success) return parsed.data;
  // Drop only the invalid keys so one typo does not disable everything.
  const bad = new Set(parsed.error.issues.map((i) => String(i.path[0])));
  const cleaned = Object.fromEntries(
    Object.entries(blankToUndefined(process.env)).filter(([k]) => !bad.has(k)),
  );
  return schema.parse(cleaned);
}

const splitList = (value?: string) => (value ?? "").split(/[\s,]+/).filter(Boolean);

export const widgetAllowedOrigins = () => splitList(env().WIDGET_ALLOWED_ORIGINS);
export const websiteAllowedHosts = () =>
  splitList(env().WEBSITE_ALLOWED_HOSTS ?? "www.lendermarket.com lendermarket.com").map((h) =>
    h.toLowerCase(),
  );
export const maxUploadBytes = () => (env().DOCUMENT_MAX_UPLOAD_MB ?? 20) * 1024 * 1024;

/** Which required integrations are missing - shown on the admin overview. */
export function missingConfiguration(): string[] {
  const e = env();
  const missing: string[] = [];
  if (!e.DATABASE_URL) missing.push("DATABASE_URL");
  if (!e.ADMIN_AUTH_SECRET || e.ADMIN_AUTH_SECRET.length < 32) missing.push("ADMIN_AUTH_SECRET (min. 32 characters)");
  if (!e.ANTHROPIC_API_KEY && !e.OPENAI_API_KEY) missing.push("ANTHROPIC_API_KEY or OPENAI_API_KEY");
  if ((e.EMBEDDING_PROVIDER ?? "openai") === "openai" && !e.OPENAI_API_KEY)
    missing.push("OPENAI_API_KEY (for embeddings, or set EMBEDDING_PROVIDER=none)");
  if (e.DOCUMENT_STORAGE === "s3" && !e.DOCUMENT_STORAGE_BUCKET) missing.push("DOCUMENT_STORAGE_BUCKET");
  if (!e.APP_URL) missing.push("APP_URL");
  return missing;
}
