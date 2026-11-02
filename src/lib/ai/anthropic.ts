import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";
import { ProviderError, type AIProviderAdapter, type GenerateRequest, type GenerateResult } from "./types";

// Models that support server-side refusal fallbacks (`fallbacks: "default"`).
const SERVER_FALLBACK_MODELS = /^claude-(opus-5|opus-5-5|sonnet-5-5|fable-5-1|fable-5)$/;

function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError)
    return new ProviderError("anthropic", "auth", "Anthropic rejected the API key");
  if (error instanceof Anthropic.RateLimitError) return new ProviderError("anthropic", "rate_limited", "Anthropic rate limit reached");
  if (error instanceof Anthropic.NotFoundError) return new ProviderError("anthropic", "bad_request", "Anthropic model not found");
  if (error instanceof Anthropic.BadRequestError) return new ProviderError("anthropic", "bad_request", "Anthropic rejected the request parameters");
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new ProviderError("anthropic", "timeout", "Anthropic request timed out");
  if (error instanceof Anthropic.APIConnectionError) return new ProviderError("anthropic", "unavailable", "Could not reach Anthropic");
  if (error instanceof Anthropic.APIError) return new ProviderError("anthropic", "unavailable", `Anthropic API error ${error.status ?? ""}`.trim());
  if (error instanceof Error && error.name === "AbortError") return new ProviderError("anthropic", "timeout", "Request aborted");
  return new ProviderError("anthropic", "unknown", "Unexpected Anthropic error");
}

export class AnthropicAdapter implements AIProviderAdapter {
  readonly name = "anthropic" as const;

  isConfigured() {
    return Boolean(env().ANTHROPIC_API_KEY);
  }

  private client(timeoutMs: number) {
    const apiKey = env().ANTHROPIC_API_KEY;
    if (!apiKey) throw new ProviderError("anthropic", "not_configured", "ANTHROPIC_API_KEY is not set");
    return new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 1 });
  }

  async generate({ system, messages, settings, signal, onDelta }: GenerateRequest): Promise<GenerateResult> {
    try {
      const client = this.client(settings.timeoutMs);
      const useFallback = SERVER_FALLBACK_MODELS.test(settings.model);
      const stream = client.beta.messages.stream(
        {
          model: settings.model,
          max_tokens: settings.maxOutputTokens,
          // System prompt is stable across requests, so it is cached.
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          ...(settings.effort ? { output_config: { effort: settings.effort } } : {}),
          ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        },
        { signal },
      );
      if (onDelta) {
        stream.on("text", (delta) => onDelta(delta));
      }
      const message = await stream.finalMessage();
      const refused = message.stop_reason === "refusal";
      const text = refused
        ? ""
        : message.content
            .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
            .map((b) => b.text)
            .join("");
      return {
        text,
        model: message.model,
        inputTokens:
          message.usage.input_tokens +
          (message.usage.cache_read_input_tokens ?? 0) +
          (message.usage.cache_creation_input_tokens ?? 0),
        outputTokens: message.usage.output_tokens,
        refused,
      };
    } catch (error) {
      throw toProviderError(error);
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const client = this.client(15_000);
      const ids: string[] = [];
      for await (const model of client.models.list({ limit: 100 })) ids.push(model.id);
      return ids;
    } catch (error) {
      throw toProviderError(error);
    }
  }
}
