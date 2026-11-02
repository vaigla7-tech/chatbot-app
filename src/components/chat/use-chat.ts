"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cleanStreamingText } from "@/lib/markers";
import { t } from "@/lib/i18n";
import { DEFAULT_LANGUAGE, isLanguageCode, type LanguageCode } from "@/lib/languages";

export interface Source {
  n: number;
  kind: "document" | "faq";
  title: string;
  url: string | null;
  page: number | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  pending?: boolean;
  sources?: Source[];
  status?: "answered" | "insufficient_information" | "conflict" | "blocked" | "error";
  escalation?: { suggested: boolean; reasonCode: string | null };
  redactedNotice?: boolean;
  feedback?: 1 | -1;
}

export interface PublicConfig {
  branding: { logoUrl: string; logoDarkUrl: string; markUrl: string; primaryColor: string; textColor: string; privacyPolicyUrl: string | null };
  languages: Array<{ code: LanguageCode; nativeName: string }>;
  welcomeMessage: string | null;
  suggestedQuestions: string[];
  support: { contactUrl: string | null; requestUrl: string | null; email: string | null };
  feedbackEnabled: boolean;
  maxMessageLength: number;
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function initialLanguage(preferred?: string | null): LanguageCode {
  if (isLanguageCode(preferred)) return preferred;
  if (typeof navigator !== "undefined") {
    const nav = navigator.language?.slice(0, 2).toLowerCase();
    if (isLanguageCode(nav)) return nav;
  }
  return DEFAULT_LANGUAGE;
}

/**
 * Chat state lives only in this hook's memory. Nothing is written to
 * localStorage/sessionStorage; reloading or closing the page clears it.
 */
export function useChat(opts: { preferredLanguage?: string | null } = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [uiLanguage, setUiLanguage] = useState<LanguageCode>(DEFAULT_LANGUAGE);
  const [explicitLanguage, setExplicitLanguage] = useState<LanguageCode | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [configError, setConfigError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string>(newId());
  const sessionStartedRef = useRef(false);

  useEffect(() => {
    setUiLanguage(initialLanguage(opts.preferredLanguage));
  }, [opts.preferredLanguage]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/config/public?lang=${uiLanguage}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: PublicConfig) => {
        if (!cancelled) {
          setConfig(data);
          setConfigError(false);
        }
      })
      .catch(() => !cancelled && setConfigError(true));
    return () => {
      cancelled = true;
    };
  }, [uiLanguage]);

  const selectLanguage = useCallback((code: LanguageCode) => {
    setUiLanguage(code);
    setExplicitLanguage(code);
  }, []);

  const updateMessage = (id: string, patch: Partial<ChatMessage>) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy) return;
      const max = config?.maxMessageLength ?? 1500;
      if (message.length > max) {
        setNotice(t(explicitLanguage ?? uiLanguage, "errors.tooLong", { max }));
        return;
      }
      setNotice(null);

      if (!sessionStartedRef.current) {
        sessionStartedRef.current = true;
        void fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "session_start", anonSessionId: sessionIdRef.current, language: uiLanguage }),
        }).catch(() => undefined);
      }

      const history = messages
        .filter((m) => !m.pending && m.status !== "error" && m.content)
        .map((m) => ({ role: m.role, content: m.content }));
      const userMsg: ChatMessage = { id: newId(), role: "user", content: message, createdAt: Date.now() };
      const assistantId = newId();
      setMessages((prev) => [...prev, userMsg, { id: assistantId, role: "assistant", content: "", createdAt: Date.now(), pending: true }]);
      setBusy(true);

      const controller = new AbortController();
      abortRef.current = controller;
      let raw = "";
      let lang: LanguageCode = explicitLanguage ?? uiLanguage;
      try {
        if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("offline");
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept-Language": lang },
          body: JSON.stringify({
            message,
            history,
            language: explicitLanguage,
            uiLanguage,
            anonSessionId: sessionIdRef.current,
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => null);
          const key = res.status === 429 ? "errors.rateLimit" : res.status === 503 ? "errors.database" : "errors.generic";
          updateMessage(assistantId, { pending: false, status: "error", content: err?.error?.message ?? t(lang, key) });
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line);
            if (event.type === "meta") {
              lang = event.language;
              if (!explicitLanguage && isLanguageCode(event.language)) setUiLanguage(event.language);
              if (event.redacted) updateMessage(assistantId, { redactedNotice: true });
            } else if (event.type === "delta") {
              raw += event.text;
              updateMessage(assistantId, { content: cleanStreamingText(raw) });
            } else if (event.type === "done") {
              updateMessage(assistantId, {
                pending: false,
                content: event.answer,
                sources: event.sources,
                status: event.status,
                escalation: event.escalation,
              });
            } else if (event.type === "error") {
              updateMessage(assistantId, { pending: false, status: "error", content: event.message });
            }
          }
        }
      } catch (error) {
        const aborted = (error as Error)?.name === "AbortError";
        const offline = (error as Error)?.message === "offline";
        updateMessage(assistantId, {
          pending: false,
          status: aborted ? undefined : "error",
          content: aborted ? cleanStreamingText(raw) || "…" : t(lang, offline ? "errors.offline" : "errors.aiUnavailable"),
        });
      } finally {
        setMessages((prev) => prev.map((m) => (m.id === assistantId && m.pending ? { ...m, pending: false } : m)));
        abortRef.current = null;
        setBusy(false);
      }
    },
    [busy, config?.maxMessageLength, explicitLanguage, messages, uiLanguage],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const retry = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    setMessages((prev) => {
      const idx = prev.lastIndexOf(lastUser);
      return prev.slice(0, idx);
    });
    setTimeout(() => void send(lastUser.content), 0);
  }, [messages, send]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setNotice(null);
  }, []);

  const sendFeedback = useCallback(
    (id: string, value: 1 | -1) => {
      updateMessage(id, { feedback: value });
      void fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "feedback", anonSessionId: sessionIdRef.current, language: uiLanguage, value }),
      }).catch(() => undefined);
    },
    [uiLanguage],
  );

  return {
    messages,
    uiLanguage,
    explicitLanguage,
    selectLanguage,
    config,
    configError,
    busy,
    notice,
    send,
    stop,
    retry,
    clear,
    sendFeedback,
  };
}
