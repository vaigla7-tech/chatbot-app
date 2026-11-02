/**
 * Optional real-provider integration tests. They cost a few tokens and only run with:
 *   RUN_AI_INTEGRATION=1 ANTHROPIC_API_KEY=… OPENAI_API_KEY=… npm run test:integration
 */
import { describe, expect, it } from "vitest";
import { AnthropicAdapter } from "@/lib/ai/anthropic";
import { OpenAIAdapter } from "@/lib/ai/openai";

const keys = { anthropic: process.env.INTEGRATION_ANTHROPIC_API_KEY, openai: process.env.INTEGRATION_OPENAI_API_KEY };
if (keys.anthropic) process.env.ANTHROPIC_API_KEY = keys.anthropic;
if (keys.openai) process.env.OPENAI_API_KEY = keys.openai;

describe.skipIf(!keys.anthropic)("Anthropic adapter (live)", () => {
  it("streams a short reply", async () => {
    let streamed = "";
    const result = await new AnthropicAdapter().generate({
      system: "Reply with the single word OK.",
      messages: [{ role: "user", content: "Connectivity check" }],
      settings: { provider: "anthropic", model: process.env.INTEGRATION_ANTHROPIC_MODEL ?? "claude-opus-5-5", maxOutputTokens: 64, timeoutMs: 60_000, effort: "low" },
      onDelta: (t) => (streamed += t),
    });
    expect(result.text.length).toBeGreaterThan(0);
    expect(streamed).toBe(result.text);
  }, 90_000);
});

describe.skipIf(!keys.openai)("OpenAI adapter (live)", () => {
  it("streams a short reply", async () => {
    const result = await new OpenAIAdapter().generate({
      system: "Reply with the single word OK.",
      messages: [{ role: "user", content: "Connectivity check" }],
      settings: { provider: "openai", model: process.env.INTEGRATION_OPENAI_MODEL ?? "gpt-4.1-mini", maxOutputTokens: 64, timeoutMs: 60_000 },
    });
    expect(result.text.length).toBeGreaterThan(0);
  }, 90_000);
});
