"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { api } from "@/components/admin/api";
import { ErrorNote, PageHeader } from "@/components/admin/shell";
import { LANGUAGES, LANGUAGE_CODES, type LanguageCode } from "@/lib/languages";
import { t } from "@/lib/i18n";

interface Config {
  support: { contactUrl: string | null; requestUrl: string | null; email: string | null };
  branding: { logoUrl: string; logoDarkUrl: string; markUrl: string; primaryColor: string; textColor: string; privacyPolicyUrl: string | null };
  welcome: Partial<Record<LanguageCode, string>>;
  analytics: { retentionDays: number; feedbackEnabled: boolean };
  languages: { enabled: LanguageCode[] };
}
interface Suggested {
  position: number;
  language: LanguageCode;
  text: string;
  enabled: boolean;
}

const nullIfEmpty = (v: string | null) => (v && v.trim() ? v.trim() : null);

export default function SettingsPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [suggested, setSuggested] = useState<Suggested[]>([]);
  const [origins, setOrigins] = useState<string[]>([]);
  const [lang, setLang] = useState<LanguageCode>("en");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    api<{ config: Config; suggestedQuestions: Suggested[]; widgetAllowedOrigins: string[] }>("/api/admin/settings")
      .then((r) => {
        setConfig(r.config);
        setSuggested(r.suggestedQuestions);
        setOrigins(r.widgetAllowedOrigins);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const save = async (key: keyof Config, value: unknown) => {
    setError(null);
    setSaved(null);
    try {
      await api("/api/admin/settings", { method: "PATCH", json: { key, value } });
      setSaved(`${key} saved`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const saveSuggested = async () => {
    setError(null);
    try {
      await api("/api/admin/settings", { method: "PATCH", json: { suggestedQuestions: suggested } });
      setSaved("Suggested questions saved");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const questionText = (position: number) => suggested.find((s) => s.position === position && s.language === lang)?.text ?? "";
  const setQuestion = (position: number, text: string) =>
    setSuggested((prev) => {
      const rest = prev.filter((s) => !(s.position === position && s.language === lang));
      return [...rest, { position, language: lang, text, enabled: true }].sort((a, b) => a.position - b.position);
    });

  if (!config) return <ErrorNote message={error} />;

  return (
    <>
      <PageHeader title="Settings" description="Investor-facing configuration. Changes apply within about 15 seconds." />
      <ErrorNote message={error} />
      {saved && <p className="mb-4 rounded-lg bg-pine/10 px-3 py-2 text-sm text-pine">{saved}.</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Support escalation destination</CardTitle>
          <p className="mt-1 text-xs text-muted">Use only verified, official channels. Leave empty until confirmed - investors then see that support details are not yet available.</p>
          <div className="mt-3 flex flex-col gap-3">
            <div>
              <Label>Contact support link</Label>
              <Input placeholder="https://…" value={config.support.contactUrl ?? ""} onChange={(e) => setConfig({ ...config, support: { ...config.support, contactUrl: e.target.value } })} />
            </div>
            <div>
              <Label>Support request / ticket form link</Label>
              <Input placeholder="https://…" value={config.support.requestUrl ?? ""} onChange={(e) => setConfig({ ...config, support: { ...config.support, requestUrl: e.target.value } })} />
            </div>
            <div>
              <Label>Verified support email</Label>
              <Input type="email" value={config.support.email ?? ""} onChange={(e) => setConfig({ ...config, support: { ...config.support, email: e.target.value } })} />
            </div>
            <Button
              className="self-start"
              onClick={() =>
                save("support", {
                  contactUrl: nullIfEmpty(config.support.contactUrl),
                  requestUrl: nullIfEmpty(config.support.requestUrl),
                  email: nullIfEmpty(config.support.email),
                })
              }
            >
              Save support settings
            </Button>
          </div>
        </Card>

        <Card>
          <CardTitle>Branding</CardTitle>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Logo URL (light backgrounds)</Label>
              <Input value={config.branding.logoUrl} onChange={(e) => setConfig({ ...config, branding: { ...config.branding, logoUrl: e.target.value } })} />
            </div>
            <div>
              <Label>Primary colour</Label>
              <div className="flex gap-2">
                <input type="color" aria-label="Primary colour" value={config.branding.primaryColor} onChange={(e) => setConfig({ ...config, branding: { ...config.branding, primaryColor: e.target.value } })} className="h-10 w-12 rounded border border-stroke" />
                <Input value={config.branding.primaryColor} onChange={(e) => setConfig({ ...config, branding: { ...config.branding, primaryColor: e.target.value } })} />
              </div>
            </div>
            <div>
              <Label>Text colour</Label>
              <div className="flex gap-2">
                <input type="color" aria-label="Text colour" value={config.branding.textColor} onChange={(e) => setConfig({ ...config, branding: { ...config.branding, textColor: e.target.value } })} className="h-10 w-12 rounded border border-stroke" />
                <Input value={config.branding.textColor} onChange={(e) => setConfig({ ...config, branding: { ...config.branding, textColor: e.target.value } })} />
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label>Privacy policy URL</Label>
              <Input placeholder="https://…" value={config.branding.privacyPolicyUrl ?? ""} onChange={(e) => setConfig({ ...config, branding: { ...config.branding, privacyPolicyUrl: e.target.value } })} />
            </div>
          </div>
          <Button className="mt-3" onClick={() => save("branding", { ...config.branding, privacyPolicyUrl: nullIfEmpty(config.branding.privacyPolicyUrl) })}>
            Save branding
          </Button>
        </Card>

        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Welcome message and suggested questions</CardTitle>
            <Select className="w-auto" value={lang} onChange={(e) => setLang(e.target.value as LanguageCode)}>
              {LANGUAGE_CODES.map((c) => (
                <option key={c} value={c}>
                  {LANGUAGES[c].name}
                </option>
              ))}
            </Select>
          </div>
          <div className="mt-3">
            <Label>Welcome message ({LANGUAGES[lang].name})</Label>
            <Textarea rows={2} placeholder={t(lang, "welcome.message")} value={config.welcome[lang] ?? ""} onChange={(e) => setConfig({ ...config, welcome: { ...config.welcome, [lang]: e.target.value } })} />
            <p className="mt-1 text-[11px] text-muted">Leave empty to use the default translation shown as placeholder.</p>
            <Button
              size="sm"
              className="mt-2"
              onClick={() => save("welcome", Object.fromEntries(Object.entries(config.welcome).filter(([, v]) => v && v.trim())))}
            >
              Save welcome messages
            </Button>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {[1, 2, 3, 4].map((p) => (
              <div key={p}>
                <Label>Suggested question {p}</Label>
                <Input value={questionText(p)} onChange={(e) => setQuestion(p, e.target.value)} />
              </div>
            ))}
          </div>
          <Button size="sm" className="mt-3" onClick={saveSuggested}>
            Save suggested questions
          </Button>
        </Card>

        <Card>
          <CardTitle>Supported languages</CardTitle>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {LANGUAGE_CODES.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.languages.enabled.includes(c)}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      languages: { enabled: e.target.checked ? [...config.languages.enabled, c] : config.languages.enabled.filter((x) => x !== c) },
                    })
                  }
                />
                {LANGUAGES[c].name}
              </label>
            ))}
          </div>
          <Button className="mt-3" onClick={() => save("languages", config.languages)}>
            Save languages
          </Button>
        </Card>

        <Card>
          <CardTitle>Privacy and retention</CardTitle>
          <div className="mt-3 flex flex-col gap-3">
            <div>
              <Label>Delete analytics after (days)</Label>
              <Input type="number" min={1} max={3650} value={config.analytics.retentionDays} onChange={(e) => setConfig({ ...config, analytics: { ...config.analytics, retentionDays: Number(e.target.value) } })} />
              <p className="mt-1 text-[11px] text-muted">Applies to analytics, escalation events and operational error logs. Full conversations are never stored.</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={config.analytics.feedbackEnabled} onChange={(e) => setConfig({ ...config, analytics: { ...config.analytics, feedbackEnabled: e.target.checked } })} />
              Show helpful / not helpful feedback buttons
            </label>
            <Button className="self-start" onClick={() => save("analytics", config.analytics)}>
              Save privacy settings
            </Button>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle>Website widget origins</CardTitle>
          <p className="mt-1 text-sm text-muted">
            Sites allowed to embed the widget (from <code>WIDGET_ALLOWED_ORIGINS</code>): {origins.length ? origins.join(", ") : "none - the widget can only be embedded on this app's own domain"}.
          </p>
        </Card>
      </div>
    </>
  );
}
