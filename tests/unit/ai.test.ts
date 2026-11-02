import { describe, expect, it } from "vitest";
import { modelCapabilities, resolveSettings } from "@/lib/ai/capabilities";
import { estimateCostUsd } from "@/lib/ai/pricing";
import { classifyCategory, detectEscalationIntent } from "@/lib/intent";
import { sanitizeHistory } from "@/lib/chat-service";

describe("model capabilities", () => {
  it("never sends temperature to current Claude models", () => {
    expect(modelCapabilities("anthropic", "claude-opus-5-5").temperature).toBe(false);
    const s = resolveSettings("anthropic", "claude-opus-5-5", { temperature: 0.7, maxOutputTokens: 900, effort: "medium" });
    expect(s.temperature).toBeUndefined();
    expect(s.effort).toBe("medium");
    expect(s.maxOutputTokens).toBe(900);
  });

  it("keeps temperature for classic OpenAI chat models but not reasoning models", () => {
    expect(resolveSettings("openai", "gpt-4.1-mini", { temperature: 0.2 }).temperature).toBe(0.2);
    const reasoning = resolveSettings("openai", "o4-mini", { temperature: 0.2 });
    expect(reasoning.temperature).toBeUndefined();
    expect(reasoning.effort).toBe("low");
  });

  it("ignores invalid stored settings", () => {
    const s = resolveSettings("anthropic", "claude-opus-5-5", { temperature: "hot", maxOutputTokens: -5 });
    expect(s.maxOutputTokens).toBe(1500);
  });

  it("estimates cost for known models only", () => {
    expect(estimateCostUsd("claude-opus-5-5", 1_000_000, 0)).toBe(4);
    expect(estimateCostUsd("unknown-model", 100, 100)).toBeNull();
  });
});

describe("intent classifiers", () => {
  it("flags account-specific and complaint questions for escalation", () => {
    expect(detectEscalationIntent("My withdrawal has not arrived yet")).toBe("withdrawal_issue");
    expect(detectEscalationIntent("I want to file a complaint")).toBe("complaint");
    expect(detectEscalationIntent("What is my balance?")).toBe("account_specific");
    expect(detectEscalationIntent("Ich möchte eine Beschwerde einreichen")).toBe("complaint");
    expect(detectEscalationIntent("What is Auto Invest?")).toBeNull();
  });

  it("maps questions to analytics categories without storing text", () => {
    expect(classifyCategory("What is Auto Invest?")).toBe("auto-invest");
    expect(classifyCategory("Jakie są ryzyka?")).toBe("investment-risks");
    expect(classifyCategory("hello")).toBe("uncategorized");
  });
});

describe("conversation history handling", () => {
  it("trims, redacts and normalises roles", () => {
    const history = sanitizeHistory(
      [
        { role: "assistant", content: "orphan" },
        { role: "user", content: "my email is a@b.com" },
        { role: "assistant", content: "ok" },
        { role: "user", content: "pending" },
      ],
      10,
      1500,
    );
    expect(history[0]?.role).toBe("user");
    expect(history[0]?.content).not.toContain("a@b.com");
    expect(history.at(-1)?.role).toBe("assistant");
  });

  it("respects the maximum number of turns", () => {
    const long = Array.from({ length: 30 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: `m${i}` }));
    expect(sanitizeHistory(long, 6, 1500).length).toBeLessThanOrEqual(6);
  });
});
