import { z } from "zod";
import { getActiveModels, getConfig } from "./config";
import { isDatabaseUnavailable } from "./db";
import { redactSensitive } from "./redact";
import { resolveResponseLanguage } from "./language-detect";
import { LANGUAGE_CODES, type LanguageCode } from "./languages";
import { t } from "./i18n";
import { retrieveKnowledge, type KnowledgeHit, type RetrievalResult } from "./retrieval";
import { buildSystemPrompt, buildUserTurn } from "./prompt";
import { parseAnswer } from "./citations";
import { getAdapter } from "./ai/registry";
import { ProviderError, type ChatTurn, type GenerationSettings, type GenerateResult } from "./ai/types";
import { estimateCostUsd } from "./ai/pricing";
import { classifyCategory, detectEscalationIntent, type EscalationReason } from "./intent";
import { recordEvent, recordOperationalError } from "./analytics";

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

export const HARD_MAX_MESSAGE = 4000;

export const chatRequestSchema = z
  .object({
    message: z.string().trim().min(1).max(HARD_MAX_MESSAGE),
    history: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().max(HARD_MAX_MESSAGE * 2),
          })
          .strict(),
      )
      .max(40)
      .default([]),
    // Explicitly selected language (overrides detection) or null for auto.
    language: z.enum(LANGUAGE_CODES).nullable().default(null),
    uiLanguage: z.enum(LANGUAGE_CODES).default("en"),
    anonSessionId: z.string().regex(/^[a-zA-Z0-9-]{8,64}$/).optional(),
  })
  .strict();

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export interface ChatSource {
  n: number;
  kind: "document" | "faq";
  title: string;
  url: string | null;
  page: number | null;
}

export type AnswerStatus = "answered" | "insufficient_information" | "conflict" | "blocked";

export type ChatEvent =
  | { type: "meta"; language: LanguageCode; redacted: boolean }
  | { type: "delta"; text: string }
  | {
      type: "done";
      answer: string;
      language: LanguageCode;
      sources: ChatSource[];
      status: AnswerStatus;
      escalation: { suggested: boolean; reasonCode: EscalationReason | null };
    }
  | { type: "error"; code: "database_unavailable" | "ai_unavailable" | "invalid_input" | "internal_error"; message: string };

// ---------------------------------------------------------------------------

/** Keep only the last N well-formed turns, starting with a user turn. */
export function sanitizeHistory(history: ChatTurn[], maxMessages: number, maxLength: number): ChatTurn[] {
  const trimmed = history
    .filter((m) => m.content.trim().length > 0)
    .slice(-maxMessages)
    .map((m) => ({
      role: m.role,
      content: (m.role === "user" ? redactSensitive(m.content).text : m.content).slice(0, maxLength * 2),
    }));
  while (trimmed[0] && trimmed[0].role !== "user") trimmed.shift();
  // Collapse consecutive same-role turns (providers expect alternation).
  const out: ChatTurn[] = [];
  for (const turn of trimmed) {
    const last = out[out.length - 1];
    if (last && last.role === turn.role) last.content += `\n\n${turn.content}`;
    else out.push({ ...turn });
  }
  if (out[out.length - 1]?.role === "user") out.pop(); // the new message is appended separately
  return out;
}

function toSources(hits: KnowledgeHit[], citedKeys: string[], language: LanguageCode): ChatSource[] {
  return citedKeys.map((key, i) => {
    const hit = hits.find((h) => h.sourceId === key)!;
    return {
      n: i + 1,
      kind: hit.kind,
      title: hit.kind === "faq" ? `${t(language, "sources.faq")}: ${hit.title}` : hit.title,
      url: hit.url,
      page: hit.pageNumber,
    };
  });
}

async function generateWithFallback(
  models: { primary: GenerationSettings; fallback: GenerationSettings | null },
  system: string,
  messages: ChatTurn[],
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<{ result: GenerateResult; settings: GenerationSettings }> {
  let streamed = false;
  const forward = (text: string) => {
    streamed = true;
    onDelta(text);
  };
  try {
    const result = await getAdapter(models.primary.provider).generate({
      system,
      messages,
      settings: models.primary,
      signal,
      onDelta: forward,
    });
    return { result, settings: models.primary };
  } catch (error) {
    const providerError = error instanceof ProviderError ? error : null;
    await recordOperationalError({
      source: "chat",
      provider: models.primary.provider,
      code: providerError?.code ?? "unknown",
      message: providerError?.message ?? "Primary model failed",
    });
    // Only the administrator-approved fallback model is used, and only if nothing was streamed yet.
    if (!models.fallback || streamed || signal?.aborted) throw error;
    const result = await getAdapter(models.fallback.provider).generate({
      system,
      messages,
      settings: models.fallback,
      signal,
      onDelta,
    });
    return { result, settings: models.fallback };
  }
}

/**
 * Run one chat turn: validate → redact → detect language → retrieve → generate
 * → validate citations → record privacy-safe analytics.
 */
export async function runChatTurn(
  request: ChatRequest,
  emit: (event: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const started = Date.now();
  const chatConfig = await getConfig("chat");

  if (request.message.length > chatConfig.maxMessageLength) {
    emit({
      type: "error",
      code: "invalid_input",
      message: t(request.language ?? request.uiLanguage, "errors.tooLong", { max: chatConfig.maxMessageLength }),
    });
    return;
  }

  const redaction = redactSensitive(request.message);
  const question = redaction.text;
  const language = resolveResponseLanguage({ selected: request.language, uiLanguage: request.uiLanguage, message: question });
  emit({ type: "meta", language, redacted: redaction.redacted });

  const intentReason = detectEscalationIntent(question);
  const baseEvent = { anonSessionId: request.anonSessionId ?? null, eventType: "QUESTION" as const, language };

  let retrieval: RetrievalResult;
  try {
    retrieval = await retrieveKnowledge(question, { language, minRelevance: chatConfig.minRelevance });
  } catch (error) {
    const db = isDatabaseUnavailable(error);
    await recordOperationalError({ source: "retrieval", code: db ? "database_unavailable" : "retrieval_failed", message: "Knowledge retrieval failed" });
    emit({ type: "error", code: db ? "database_unavailable" : "internal_error", message: t(language, db ? "errors.database" : "errors.generic") });
    return;
  }

  const category = retrieval.hits[0]?.categorySlug ?? classifyCategory(question);
  const embeddingCost = estimateCostUsd("text-embedding-3-small", retrieval.embeddingTokens, 0) ?? 0;

  const finishInsufficient = async (status: AnswerStatus, reason: EscalationReason) => {
    const answer = t(language, "answer.insufficient");
    emit({ type: "done", answer, language, sources: [], status, escalation: { suggested: true, reasonCode: reason } });
    await recordEvent({
      ...baseEvent,
      category,
      answered: false,
      answerStatus: status,
      escalated: true,
      latencyMs: Date.now() - started,
      estimatedCost: embeddingCost,
    });
  };

  if (!retrieval.sufficient) {
    await finishInsufficient("insufficient_information", "no_information");
    return;
  }

  let models;
  try {
    models = await getActiveModels();
  } catch (error) {
    emit({ type: "error", code: isDatabaseUnavailable(error) ? "database_unavailable" : "internal_error", message: t(language, "errors.database") });
    return;
  }

  const history = sanitizeHistory(request.history, chatConfig.maxHistoryMessages, chatConfig.maxMessageLength);
  const messages: ChatTurn[] = [...history, { role: "user", content: buildUserTurn(question, retrieval.hits, language) }];
  const system = buildSystemPrompt(chatConfig.systemPromptAddendum);

  let generation: { result: GenerateResult; settings: GenerationSettings };
  try {
    generation = await generateWithFallback(models, system, messages, (text) => emit({ type: "delta", text }), signal);
  } catch (error) {
    const providerError = error instanceof ProviderError ? error : null;
    emit({ type: "error", code: "ai_unavailable", message: t(language, "errors.aiUnavailable") });
    await recordEvent({
      ...baseEvent,
      eventType: "ERROR",
      category,
      answered: false,
      answerStatus: "error",
      latencyMs: Date.now() - started,
      provider: models.primary.provider,
      model: models.primary.model,
    });
    if (!providerError) console.error("[chat] unexpected generation failure");
    return;
  }

  const { result, settings } = generation;
  const cost = (estimateCostUsd(result.model, result.inputTokens, result.outputTokens) ?? 0) + embeddingCost;
  const sourceKeys = retrieval.hits.map((h) => h.sourceId);
  const parsed = parseAnswer(result.text, sourceKeys);
  const usage = {
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    estimatedCost: cost,
    provider: settings.provider,
    model: result.model,
  };

  // Guardrails on the output.
  const uncitedFacts = parsed.citedKeys.length === 0 && /\d/.test(parsed.text);
  if (result.refused || parsed.leaked) {
    await recordOperationalError({ source: "chat", provider: settings.provider, code: parsed.leaked ? "prompt_leak_blocked" : "refusal", message: "Answer blocked by output guardrail" });
    const answer = t(language, "answer.insufficient");
    emit({ type: "done", answer, language, sources: [], status: "blocked", escalation: { suggested: true, reasonCode: "no_information" } });
    await recordEvent({ ...baseEvent, ...usage, category, answered: false, answerStatus: "blocked", escalated: true, latencyMs: Date.now() - started });
    return;
  }
  if (parsed.noAnswer || uncitedFacts) {
    const answer = t(language, "answer.insufficient");
    emit({ type: "done", answer, language, sources: [], status: "insufficient_information", escalation: { suggested: true, reasonCode: "no_information" } });
    await recordEvent({ ...baseEvent, ...usage, category, answered: false, answerStatus: "insufficient_information", escalated: true, latencyMs: Date.now() - started });
    return;
  }

  const status: AnswerStatus = parsed.conflict ? "conflict" : "answered";
  const reasonCode: EscalationReason | null = parsed.conflict
    ? "conflicting_sources"
    : parsed.escalate
      ? (intentReason ?? "model_requested")
      : intentReason;
  const answer = parsed.conflict ? `${parsed.text}\n\n_${t(language, "answer.conflict")}_` : parsed.text;
  const citedHits = retrieval.hits.filter((h) => parsed.citedKeys.includes(h.sourceId));
  emit({
    type: "done",
    answer,
    language,
    sources: toSources(retrieval.hits, parsed.citedKeys, language),
    status,
    escalation: { suggested: reasonCode !== null, reasonCode },
  });
  await recordEvent({
    ...baseEvent,
    ...usage,
    category: citedHits[0]?.categorySlug ?? category,
    answered: true,
    answerStatus: status,
    escalated: reasonCode !== null,
    latencyMs: Date.now() - started,
  });
}
