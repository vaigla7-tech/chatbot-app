import { AnthropicAdapter } from "./anthropic";
import { OpenAIAdapter } from "./openai";
import type { AIProviderAdapter, ProviderName } from "./types";

/**
 * Provider registry. To add a provider (e.g. a self-hosted open-weight model),
 * implement AIProviderAdapter and register it here.
 */
const adapters: Record<ProviderName, AIProviderAdapter> = {
  anthropic: new AnthropicAdapter(),
  openai: new OpenAIAdapter(),
};

let override: Partial<Record<ProviderName, AIProviderAdapter>> = {};

export function getAdapter(name: ProviderName): AIProviderAdapter {
  return override[name] ?? adapters[name];
}

/** Test hook: swap adapters for deterministic mocks. */
export function setAdapterOverrides(next: Partial<Record<ProviderName, AIProviderAdapter>>) {
  override = next;
}
