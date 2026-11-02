import { beforeEach, describe, expect, it, vi } from "vitest";

// Simulate an unreachable database for every Prisma call.
vi.mock("@/lib/db", () => {
  const fail = async () => {
    throw Object.assign(new Error("Can't reach database server"), { name: "PrismaClientInitializationError" });
  };
  const model = new Proxy({}, { get: () => fail });
  return {
    prisma: new Proxy({}, { get: (_t, prop) => (prop === "$transaction" || prop === "$queryRaw" ? fail : model) }),
    isDatabaseUnavailable: (e: unknown) => (e as { name?: string })?.name === "PrismaClientInitializationError",
  };
});

import { clearConfigCache, getConfig, getSuggestedQuestions } from "@/lib/config";
import { GET as publicConfig } from "@/app/api/config/public/route";
import { runChatTurn, chatRequestSchema, type ChatEvent } from "@/lib/chat-service";
import { loadStoredChat, saveStoredChat, type ChatMessage } from "@/components/chat/use-chat";

beforeEach(() => clearConfigCache());

describe("database outage", () => {
  it("serves default configuration and suggested questions", async () => {
    expect((await getConfig("chat")).maxMessageLength).toBe(1500);
    expect(await getSuggestedQuestions("de")).toEqual([
      "Wie funktioniert Lendermarket?",
      "Was ist Auto Invest?",
      "Wie kann ich Geld einzahlen oder auszahlen?",
      "Welche Risiken birgt das Investieren?",
    ]);
  });

  it("keeps the public config endpoint working", async () => {
    const res = await publicConfig(new Request("http://localhost/api/config/public?lang=et"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestedQuestions).toHaveLength(4);
    expect(body.suggestedQuestions[0]).toBe("Kuidas Lendermarket toimib?");
  });

  it("tells the investor about the temporary issue in their language", async () => {
    const events: ChatEvent[] = [];
    await runChatTurn(chatRequestSchema.parse({ message: "What is Auto Invest?", language: "it" }), (e) => events.push(e));
    expect(events.at(-1)).toMatchObject({ type: "error", code: "database_unavailable" });
    expect((events.at(-1) as { message: string }).message).toMatch(/problema tecnico temporaneo/);
  });
});

describe("tab-scoped chat storage", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
  });

  const msg = (id: string, role: "user" | "assistant", extra: Partial<ChatMessage> = {}): ChatMessage => ({ id, role, content: `m-${id}`, createdAt: 1, ...extra });

  it("restores a saved conversation and drops replies that were still streaming", () => {
    saveStoredChat("k", { messages: [msg("1", "user"), msg("2", "assistant"), msg("3", "assistant", { pending: true })], uiLanguage: "fr", explicitLanguage: "fr", sessionId: "abc12345" });
    const restored = loadStoredChat("k");
    expect(restored?.messages.map((m) => m.id)).toEqual(["1", "2"]);
    expect(restored?.explicitLanguage).toBe("fr");
    expect(restored?.sessionId).toBe("abc12345");
  });

  it("removes the stored copy when the conversation is empty and ignores corrupt data", () => {
    saveStoredChat("k", { messages: [msg("1", "user")], uiLanguage: "en", explicitLanguage: null, sessionId: "s" });
    saveStoredChat("k", { messages: [], uiLanguage: "en", explicitLanguage: null, sessionId: "s" });
    expect(loadStoredChat("k")).toBeNull();
    window.sessionStorage.setItem("bad", "{not json");
    expect(loadStoredChat("bad")).toBeNull();
  });
});
