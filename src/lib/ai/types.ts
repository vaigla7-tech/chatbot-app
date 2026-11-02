export type ProviderName = "anthropic" | "openai";
export const PROVIDER_NAMES: ProviderName[] = ["anthropic", "openai"];

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export type Effort = "low" | "medium" | "high";

/** Settings already validated against the model's capabilities. */
export interface GenerationSettings {
  provider: ProviderName;
  model: string;
  maxOutputTokens: number;
  timeoutMs: number;
  temperature?: number;
  effort?: Effort;
}

export interface GenerateRequest {
  system: string;
  messages: ChatTurn[];
  settings: GenerationSettings;
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
}

export interface GenerateResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** The provider declined the request (safety refusal). */
  refused: boolean;
}

/** Common adapter interface every AI provider implements. */
export interface AIProviderAdapter {
  readonly name: ProviderName;
  isConfigured(): boolean;
  generate(request: GenerateRequest): Promise<GenerateResult>;
  listModels(): Promise<string[]>;
}

/** Sanitized provider failure - the message never contains keys or user text. */
export class ProviderError extends Error {
  constructor(
    public readonly provider: ProviderName,
    public readonly code: "not_configured" | "auth" | "rate_limited" | "timeout" | "unavailable" | "bad_request" | "unknown",
    message: string,
  ) {
    super(message);
  }

  get retryable(): boolean {
    return this.code === "rate_limited" || this.code === "timeout" || this.code === "unavailable";
  }
}
