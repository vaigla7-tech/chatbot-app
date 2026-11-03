import OpenAI from "openai";
import { env } from "../env";
import { ProviderError, type AIProviderAdapter, type GenerateRequest, type GenerateResult } from "./types";

function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof OpenAI.AuthenticationError)
    return new ProviderError("openai", "auth", "OpenAI rejected the API key as invalid (HTTP 401)");
  if (error instanceof OpenAI.PermissionDeniedError)
    return new ProviderError("openai", "auth", "The OpenAI API key is valid but not allowed to use this model or project (HTTP 403)");
  if (error instanceof OpenAI.RateLimitError) return new ProviderError("openai", "rate_limited", "OpenAI rate limit reached");
  if (error instanceof OpenAI.NotFoundError) return new ProviderError("openai", "bad_request", "OpenAI model not found");
  if (error instanceof OpenAI.BadRequestError) return new ProviderError("openai", "bad_request", "OpenAI rejected the request parameters");
  if (error instanceof OpenAI.APIConnectionTimeoutError) return new ProviderError("openai", "timeout", "OpenAI request timed out");
  if (error instanceof OpenAI.APIConnectionError) return new ProviderError("openai", "unavailable", "Could not reach OpenAI");
  if (error instanceof OpenAI.APIError) return new ProviderError("openai", "unavailable", `OpenAI API error ${error.status ?? ""}`.trim());
  if (error instanceof Error && error.name === "AbortError") return new ProviderError("openai", "timeout", "Request aborted");
  return new ProviderError("openai", "unknown", "Unexpected OpenAI error");
}

export function openAIClient(timeoutMs = 30_000): OpenAI {
  const apiKey = env().OPENAI_API_KEY;
  if (!apiKey) throw new ProviderError("openai", "not_configured", "OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey, timeout: timeoutMs, maxRetries: 1 });
}

export class OpenAIAdapter implements AIProviderAdapter {
  readonly name = "openai" as const;

  isConfigured() {
    return Boolean(env().OPENAI_API_KEY);
  }

  async generate({ system, messages, settings, signal, onDelta }: GenerateRequest): Promise<GenerateResult> {
    try {
      const client = openAIClient(settings.timeoutMs);
      const stream = await client.chat.completions.create(
        {
          model: settings.model,
          stream: true,
          stream_options: { include_usage: true },
          max_completion_tokens: settings.maxOutputTokens,
          messages: [{ role: "system", content: system }, ...messages],
          ...(settings.temperature !== undefined ? { temperature: settings.temperature } : {}),
          ...(settings.effort ? { reasoning_effort: settings.effort } : {}),
        },
        { signal },
      );
      let text = "";
      let model = settings.model;
      let inputTokens = 0;
      let outputTokens = 0;
      let refused = false;
      for await (const chunk of stream) {
        model = chunk.model || model;
        const choice = chunk.choices[0];
        const delta = choice?.delta?.content;
        if (delta) {
          text += delta;
          onDelta?.(delta);
        }
        if (choice?.delta?.refusal) refused = true;
        if (choice?.finish_reason === "content_filter") refused = true;
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
        }
      }
      return { text: refused ? "" : text, model, inputTokens, outputTokens, refused };
    } catch (error) {
      throw toProviderError(error);
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const client = openAIClient(15_000);
      const ids: string[] = [];
      for await (const model of client.models.list()) ids.push(model.id);
      return ids.filter((id) => /^(gpt|o\d|chatgpt)/.test(id) && !/(audio|realtime|image|tts|transcribe|search)/.test(id)).sort();
    } catch (error) {
      throw toProviderError(error);
    }
  }
}
