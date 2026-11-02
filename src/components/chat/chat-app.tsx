"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertCircle,
  ArrowUp,
  ExternalLink,
  FileText,
  Headset,
  HelpCircle,
  Maximize2,
  RotateCcw,
  ShieldCheck,
  Square,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { t, type MessageKey } from "@/lib/i18n";
import { LANGUAGES, LANGUAGE_CODES, type LanguageCode } from "@/lib/languages";
import { useChat, type ChatMessage } from "./use-chat";

type Mode = "page" | "widget";

export function ChatApp({ mode = "page", preferredLanguage }: { mode?: Mode; preferredLanguage?: string | null }) {
  const chat = useChat({ preferredLanguage, storageKey: mode === "widget" ? "lm-chat-widget-v1" : undefined });
  const { messages, uiLanguage, config, busy } = chat;
  const tr = (key: MessageKey, vars?: Record<string, string | number>) => t(uiLanguage, key, vars);
  const [input, setInput] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    document.documentElement.lang = uiLanguage;
  }, [uiLanguage]);

  // Auto-grow the textarea up to a limit.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const submit = (text = input) => {
    if (!text.trim() || busy) return;
    void chat.send(text);
    setInput("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const closeWidget = () => window.parent?.postMessage({ source: "lm-chat", type: "close" }, "*");
  const toggleFullscreen = () => window.parent?.postMessage({ source: "lm-chat", type: "toggle-fullscreen" }, "*");

  const themeStyle = config
    ? ({ "--brand-primary": config.branding.primaryColor, "--brand-text": config.branding.textColor } as CSSProperties)
    : undefined;
  const maxLength = config?.maxMessageLength ?? 1500;
  const languages = config?.languages ?? LANGUAGE_CODES.map((code) => ({ code, nativeName: LANGUAGES[code].nativeName }));
  const supportHref = config?.support.contactUrl ?? (config?.support.email ? `mailto:${config.support.email}` : null);

  return (
    <div style={themeStyle} className={cn("flex h-dvh flex-col bg-white text-ink", mode === "page" && "md:bg-lilac/60")}>
      {/* Header */}
      <header className="z-10 flex shrink-0 items-center gap-3 border-b border-stroke bg-white px-3 py-2.5 sm:px-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={config?.branding.logoUrl ?? "/brand/lendermarket-logo-black.svg"}
          alt="Lendermarket"
          className={cn("h-6 w-auto shrink-0", mode === "widget" && "hidden sm:block")}
        />
        <div className={cn("min-w-0 border-stroke", mode === "page" ? "hidden border-l pl-3 sm:block" : "sm:border-l sm:pl-3")}>
          <p className="truncate text-sm font-semibold leading-tight">{tr("app.title")}</p>
          <p className="truncate text-xs text-muted">{tr("app.subtitle")}</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <label className="sr-only" htmlFor="lm-language">
            {tr("header.language")}
          </label>
          <select
            id="lm-language"
            value={uiLanguage}
            onChange={(e) => chat.selectLanguage(e.target.value as LanguageCode)}
            className="h-9 rounded-full border border-stroke bg-white px-3 text-sm font-medium text-ink focus:border-brand focus:outline-none"
            aria-label={tr("header.language")}
          >
            {languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.code.toUpperCase()} · {l.nativeName}
              </option>
            ))}
          </select>
          {supportHref && (
            <a
              href={supportHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex size-9 items-center justify-center rounded-full text-ink hover:bg-lilac"
              aria-label={tr("header.help")}
              title={tr("header.help")}
            >
              <HelpCircle className="size-5" />
            </a>
          )}
          {mode === "widget" && (
            <>
              <Button variant="ghost" size="iconSm" className="hidden sm:inline-flex" onClick={toggleFullscreen} aria-label={tr("widget.fullscreen")}>
                <Maximize2 />
              </Button>
              <Button variant="ghost" size="iconSm" onClick={closeWidget} aria-label={tr("widget.close")}>
                <X />
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Conversation */}
      <main
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain scroll-smooth"
        aria-live="polite"
        aria-busy={busy}
      >
        <div className={cn("mx-auto flex w-full flex-col gap-4 px-3 py-5 sm:px-5", mode === "page" && "max-w-3xl")}>
          <Welcome
            message={config?.welcomeMessage ?? tr("welcome.message")}
            title={tr("welcome.suggestedTitle")}
            questions={config?.suggestedQuestions ?? []}
            onPick={submit}
            disabled={busy}
            compact={messages.length > 0}
          />
          {chat.configError && (
            <p className="rounded-xl bg-smoke px-3 py-2 text-xs text-muted" role="status">
              {tr("errors.database")}
            </p>
          )}
          {messages.map((m, i) => (
            <MessageRow
              key={m.id}
              message={m}
              language={uiLanguage}
              isLast={i === messages.length - 1}
              feedbackEnabled={config?.feedbackEnabled ?? false}
              onRetry={chat.retry}
              onFeedback={chat.sendFeedback}
            />
          ))}
        </div>
      </main>

      {/* Composer */}
      <footer className="shrink-0 border-t border-stroke bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">
        <div className={cn("mx-auto w-full", mode === "page" && "max-w-3xl")}>
          {chat.notice && (
            <p className="mb-2 text-xs text-red-700" role="alert">
              {chat.notice}
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex items-end gap-2 rounded-2xl border border-stroke bg-white p-1.5 focus-within:border-brand"
          >
            <label htmlFor="lm-input" className="sr-only">
              {tr("input.placeholder")}
            </label>
            <textarea
              id="lm-input"
              ref={inputRef}
              rows={1}
              value={input}
              maxLength={maxLength}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={tr("input.placeholder")}
              className="lm-composer max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] leading-6 text-ink placeholder:text-muted focus:outline-none focus-visible:outline-none"
              enterKeyHint="send"
              autoComplete="off"
            />
            {busy ? (
              <Button size="icon" variant="secondary" onClick={chat.stop} aria-label={tr("chat.stop")}>
                <Square className="fill-current" />
              </Button>
            ) : (
              <Button type="submit" size="icon" disabled={!input.trim()} aria-label={tr("input.send")}>
                <ArrowUp />
              </Button>
            )}
          </form>
          <div className="mt-2 flex items-start justify-between gap-3">
            <p className="flex items-start gap-1.5 text-[11px] leading-4 text-muted">
              <ShieldCheck className="mt-px size-3.5 shrink-0 text-pine" aria-hidden />
              <span>
                {tr("notice.disclaimer")}{" "}
                <PrivacyNotice language={uiLanguage} policyUrl={config?.branding.privacyPolicyUrl ?? null} />
              </span>
            </p>
            <div className="flex shrink-0 items-center gap-2">
              {input.length > maxLength * 0.8 && (
                <span className="text-[11px] text-muted">{tr("input.counter", { count: input.length, max: maxLength })}</span>
              )}
              {messages.length > 0 &&
                (confirmClear ? (
                  <span className="flex items-center gap-1 text-[11px]">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        chat.clear();
                        setConfirmClear(false);
                      }}
                    >
                      {tr("chat.clear")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmClear(false)}>
                      {tr("chat.cancel")}
                    </Button>
                  </span>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmClear(true)} title={tr("chat.clearConfirm")}>
                    <Trash2 /> <span className="hidden sm:inline">{tr("chat.clear")}</span>
                  </Button>
                ))}
            </div>
          </div>
          <p className="mt-1 hidden text-[11px] text-muted md:block">{tr("input.hint")}</p>
        </div>
      </footer>
    </div>
  );
}

function Welcome(props: { message: string; title: string; questions: string[]; onPick: (q: string) => void; disabled: boolean; compact: boolean }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <AssistantAvatar />
        <div className="rounded-2xl rounded-tl-md border border-stroke bg-white px-4 py-3 text-[15px] leading-6 shadow-sm">{props.message}</div>
      </div>
      {!props.compact && props.questions.length > 0 && (
        <div className="pl-10">
          <p className="mb-2 text-xs font-semibold text-muted">{props.title}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {props.questions.map((q) => (
              <button
                key={q}
                type="button"
                disabled={props.disabled}
                onClick={() => props.onPick(q)}
                className="min-h-11 rounded-xl border border-stroke bg-white px-3.5 py-2.5 text-left text-sm font-medium text-ink transition-colors hover:border-brand hover:bg-lilac disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function AssistantAvatar() {
  return (
    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-lilac" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/lendermarket-logomark.svg" alt="" className="size-4" />
    </span>
  );
}

function formatTime(ts: number, language: LanguageCode) {
  try {
    return new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit" }).format(ts);
  } catch {
    return "";
  }
}

function MessageRow(props: {
  message: ChatMessage;
  language: LanguageCode;
  isLast: boolean;
  feedbackEnabled: boolean;
  onRetry: () => void;
  onFeedback: (id: string, v: 1 | -1) => void;
}) {
  const { message: m, language } = props;
  const tr = (key: MessageKey) => t(language, key);

  if (m.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-indigo px-4 py-2.5 text-[15px] leading-6 text-white">
          {m.content}
        </div>
        <time className="pr-1 text-[11px] text-muted">{formatTime(m.createdAt, language)}</time>
      </div>
    );
  }

  const isError = m.status === "error";
  return (
    <div className="flex items-start gap-2.5">
      <AssistantAvatar />
      <div className="flex min-w-0 max-w-[90%] flex-col gap-2">
        {m.redactedNotice && (
          <p className="rounded-xl bg-lilac px-3 py-2 text-xs text-ocean" role="status">
            {tr("notice.redacted")}
          </p>
        )}
        <div
          className={cn(
            "rounded-2xl rounded-tl-md border px-4 py-3 text-[15px] leading-6 shadow-sm",
            isError ? "border-red-200 bg-red-50 text-red-800" : "border-stroke bg-white",
          )}
        >
          {m.pending && !m.content ? (
            <span className="flex items-center gap-2 text-sm text-muted" role="status">
              <span className="flex gap-1" aria-hidden>
                <span className="lm-dot size-1.5 rounded-full bg-brand" />
                <span className="lm-dot size-1.5 rounded-full bg-brand" />
                <span className="lm-dot size-1.5 rounded-full bg-brand" />
              </span>
              {tr("chat.typing")}
            </span>
          ) : isError ? (
            <p className="flex items-start gap-2">
              <AlertCircle className="mt-1 size-4 shrink-0" aria-hidden />
              {m.content}
            </p>
          ) : (
            <div className="prose-chat break-words">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                skipHtml
                allowedElements={["p", "strong", "em", "ul", "ol", "li", "a", "h1", "h2", "h3", "code", "br", "blockquote"]}
                unwrapDisallowed
                components={{
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
                      {children}
                    </a>
                  ),
                }}
              >
                {m.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {!!m.sources?.length && (
          <div className="rounded-xl border border-stroke bg-lilac/60 px-3 py-2">
            <p className="mb-1 text-xs font-semibold">{tr("sources.title")}</p>
            <ol className="flex flex-col gap-1">
              {m.sources.map((s) => (
                <li key={s.n} className="flex items-start gap-1.5 text-xs">
                  <span className="font-semibold text-ocean">[{s.n}]</span>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 text-ocean underline underline-offset-2">
                      <span>
                        {s.title}
                        {s.page ? ` · p. ${s.page}` : ""}
                      </span>
                      <ExternalLink className="mt-0.5 size-3 shrink-0" aria-hidden />
                    </a>
                  ) : (
                    <span className="inline-flex items-start gap-1 text-ink">
                      <FileText className="mt-0.5 size-3 shrink-0" aria-hidden />
                      {s.title}
                      {s.page ? ` · p. ${s.page}` : ""}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}

        {m.escalation?.suggested && !m.pending && <EscalationCard language={language} reasonCode={m.escalation.reasonCode} />}

        {!m.pending && (
          <div className="flex items-center gap-2 pl-1 text-[11px] text-muted">
            <time>{formatTime(m.createdAt, language)}</time>
            {isError && props.isLast && (
              <Button variant="link" size="sm" className="h-auto px-0 text-[11px]" onClick={props.onRetry}>
                <RotateCcw className="size-3" /> {tr("chat.retry")}
              </Button>
            )}
            {props.feedbackEnabled && !isError && m.content && (
              <span className="ml-1 flex items-center gap-0.5">
                {m.feedback ? (
                  <span>{tr("feedback.thanks")}</span>
                ) : (
                  <>
                    <span className="sr-only">{tr("feedback.question")}</span>
                    <button type="button" className="rounded p-1 hover:bg-lilac" onClick={() => props.onFeedback(m.id, 1)} aria-label={tr("feedback.helpful")}>
                      <ThumbsUp className="size-3.5" />
                    </button>
                    <button type="button" className="rounded p-1 hover:bg-lilac" onClick={() => props.onFeedback(m.id, -1)} aria-label={tr("feedback.notHelpful")}>
                      <ThumbsDown className="size-3.5" />
                    </button>
                  </>
                )}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EscalationCard({ language, reasonCode }: { language: LanguageCode; reasonCode: string | null }) {
  const tr = (key: MessageKey) => t(language, key);
  const [confirmRequest, setConfirmRequest] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const reason = reasonCode ?? "user_requested";

  const go = async (action: "contact" | "request") => {
    // Open the window synchronously so popup blockers allow it; navigate once we know the destination.
    const win = window.open("", "_blank", "noopener=no");
    try {
      const res = await fetch("/api/escalations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reasonCode: reason, language }),
      });
      const data = await res.json();
      if (data.destination?.startsWith("mailto:")) {
        win?.close();
        window.location.href = data.destination;
      } else if (data.destination) {
        if (win) {
          win.opener = null;
          win.location.href = data.destination;
        } else window.location.href = data.destination;
      } else {
        win?.close();
        setUnavailable(true);
      }
    } catch {
      win?.close();
      setUnavailable(true);
    }
  };

  return (
    <div className="rounded-xl border border-stroke bg-white px-3 py-3">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Headset className="size-4 text-brand" aria-hidden />
        {tr("escalation.prompt")}
      </p>
      <p className="mt-1 text-xs text-muted">{tr("notice.accountSpecific")}</p>
      {unavailable ? (
        <p className="mt-2 text-xs text-ocean">{tr("escalation.notConfigured")}</p>
      ) : confirmRequest ? (
        <div className="mt-2 flex flex-col gap-2">
          <p className="rounded-lg bg-lilac px-3 py-2 text-xs text-ink">{tr("escalation.requestInfo")}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void go("request")}>
              {tr("escalation.continue")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmRequest(false)}>
              {tr("chat.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void go("contact")}>
            {tr("escalation.contact")}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setConfirmRequest(true)}>
            {tr("escalation.createRequest")}
          </Button>
        </div>
      )}
    </div>
  );
}

function PrivacyNotice({ language, policyUrl }: { language: LanguageCode; policyUrl: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="font-semibold text-ocean underline underline-offset-2" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {t(language, "notice.privacyTitle")}
      </button>
      {open && (
        <span className="mt-1 block max-h-20 overflow-y-auto text-[11px] text-ink">
          {t(language, "notice.privacy")}{" "}
          {policyUrl && (
            <a href={policyUrl} target="_blank" rel="noopener noreferrer" className="text-ocean underline">
              {policyUrl.replace(/^https:\/\//, "")}
            </a>
          )}
        </span>
      )}
    </>
  );
}
