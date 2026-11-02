"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Plug, Plus, Star, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { api, fmtDate } from "@/components/admin/api";
import { ErrorNote, PageHeader } from "@/components/admin/shell";
import { modelCapabilities } from "@/lib/ai/capabilities";
import type { ProviderName } from "@/lib/ai/types";

interface Config {
  id: string;
  providerName: ProviderName;
  modelName: string;
  enabled: boolean;
  active: boolean;
  isFallback: boolean;
  settings: { temperature?: number; maxOutputTokens?: number; effort?: "low" | "medium" | "high"; timeoutMs?: number };
  effective: { maxOutputTokens: number; timeoutMs: number; temperature?: number; effort?: string };
}

interface Data {
  providers: Array<{ name: ProviderName; configured: boolean }>;
  configs: Config[];
  recentErrors: Array<{ id: string; timestamp: string; source: string; provider: string | null; code: string; message: string }>;
}

type Form = {
  id?: string;
  providerName: ProviderName;
  modelName: string;
  enabled: boolean;
  maxOutputTokens: string;
  timeoutMs: string;
  temperature: string;
  effort: "" | "low" | "medium" | "high";
};

const blankForm: Form = { providerName: "anthropic", modelName: "", enabled: true, maxOutputTokens: "1500", timeoutMs: "45000", temperature: "", effort: "low" };

export default function AiSettingsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chat, setChat] = useState<{ systemPromptAddendum: string; rateLimitPerMinute: number | null; rateLimitPerDay: number | null; maxMessageLength: number; maxHistoryMessages: number; minRelevance: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([
        api<Data>("/api/admin/ai-settings"),
        api<{ config: { chat: NonNullable<typeof chat> } }>("/api/admin/settings"),
      ]);
      setData(d);
      setChat(s.config.chat);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!form) return;
    setModels([]);
    setModelsError(null);
    api<{ models: string[]; error?: string }>(`/api/admin/ai-settings/models?provider=${form.providerName}`)
      .then((r) => {
        setModels(r.models);
        if (r.error) setModelsError(r.error);
      })
      .catch((e) => setModelsError((e as Error).message));
  }, [form?.providerName]); // eslint-disable-line react-hooks/exhaustive-deps

  const caps = form && form.modelName ? modelCapabilities(form.providerName, form.modelName) : null;

  const settingsPayload = (f: Form) => ({
    ...(f.maxOutputTokens ? { maxOutputTokens: Number(f.maxOutputTokens) } : {}),
    ...(f.timeoutMs ? { timeoutMs: Number(f.timeoutMs) } : {}),
    ...(caps?.temperature && f.temperature !== "" ? { temperature: Number(f.temperature) } : {}),
    ...(caps?.effort && f.effort ? { effort: f.effort } : {}),
  });

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const save = () =>
    form &&
    run(async () => {
      await api("/api/admin/ai-settings", {
        method: "PATCH",
        json: { action: "upsert", id: form.id, providerName: form.providerName, modelName: form.modelName.trim(), enabled: form.enabled, settings: settingsPayload(form) },
      });
      setForm(null);
    });

  const runTest = async (providerName: ProviderName, modelName: string, settings: object) => {
    setTest({ ok: true, text: `Testing ${modelName}…` });
    try {
      const r = await api<{ ok: boolean; latencyMs: number; model?: string; reply?: string; error?: { code: string; message: string } }>(
        "/api/admin/ai-settings/test",
        { method: "POST", json: { providerName, modelName, settings } },
      );
      setTest(
        r.ok
          ? { ok: true, text: `Connected to ${r.model} in ${r.latencyMs} ms (reply: "${r.reply}")` }
          : { ok: false, text: `Failed (${r.error?.code}): ${r.error?.message}` },
      );
    } catch (e) {
      setTest({ ok: false, text: (e as Error).message });
    }
  };

  const saveChat = () =>
    chat &&
    run(async () => {
      await api("/api/admin/settings", { method: "PATCH", json: { key: "chat", value: chat } });
      alert("Saved.");
    });

  return (
    <>
      <PageHeader
        title="AI Settings"
        description="Choose which model answers investors. Investors always see one Lendermarket assistant regardless of the model. API keys are set as Railway environment variables and are never stored in the database."
        actions={
          <Button onClick={() => setForm({ ...blankForm })}>
            <Plus /> Add model
          </Button>
        }
      />
      <ErrorNote message={error} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        {data?.providers.map((p) => (
          <Card key={p.name} className="flex items-center justify-between py-4">
            <span className="text-sm font-semibold capitalize">{p.name}</span>
            {p.configured ? (
              <Badge tone="success">
                <CheckCircle2 className="mr-1 size-3" /> API key configured
              </Badge>
            ) : (
              <Badge tone="warning">
                <XCircle className="mr-1 size-3" /> Set {p.name === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"}
              </Badge>
            )}
          </Card>
        ))}
      </div>

      {test && (
        <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${test.ok ? "bg-pine/10 text-pine" : "bg-red-50 text-red-800"}`} role="status">
          {test.text}
        </p>
      )}

      {form && (
        <Card className="mb-6">
          <CardTitle>{form.id ? "Edit model configuration" : "Add model configuration"}</CardTitle>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <Label>Provider</Label>
              <Select value={form.providerName} onChange={(e) => setForm({ ...form, providerName: e.target.value as ProviderName, modelName: "" })} disabled={!!form.id}>
                <option value="anthropic">Anthropic Claude</option>
                <option value="openai">OpenAI</option>
              </Select>
            </div>
            <div>
              <Label>Model</Label>
              <Input list="model-options" value={form.modelName} onChange={(e) => setForm({ ...form, modelName: e.target.value })} placeholder={models.length ? "Choose or type a model id" : "Model id"} disabled={!!form.id} />
              <datalist id="model-options">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <p className="mt-1 text-[11px] text-muted">{modelsError ? `Model list unavailable: ${modelsError}` : `${models.length} models available from the provider`}</p>
            </div>
            <div>
              <Label>Maximum output tokens</Label>
              <Input type="number" min={64} max={32000} value={form.maxOutputTokens} onChange={(e) => setForm({ ...form, maxOutputTokens: e.target.value })} />
            </div>
            <div>
              <Label>Timeout (ms)</Label>
              <Input type="number" min={5000} max={120000} step={1000} value={form.timeoutMs} onChange={(e) => setForm({ ...form, timeoutMs: e.target.value })} />
            </div>
            {caps?.temperature && (
              <div>
                <Label>Temperature (0-2)</Label>
                <Input type="number" min={0} max={2} step={0.1} value={form.temperature} onChange={(e) => setForm({ ...form, temperature: e.target.value })} placeholder="Provider default" />
              </div>
            )}
            {caps?.effort && (
              <div>
                <Label>Reasoning effort</Label>
                <Select value={form.effort} onChange={(e) => setForm({ ...form, effort: e.target.value as Form["effort"] })}>
                  <option value="low">Low (fastest, cheapest)</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </Select>
              </div>
            )}
            {caps && !caps.temperature && (
              <p className="text-xs text-muted md:col-span-2">This model does not accept a temperature setting, so it is not shown.</p>
            )}
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Enabled
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={save} disabled={!form.modelName.trim()}>
              Save
            </Button>
            <Button variant="secondary" disabled={!form.modelName.trim()} onClick={() => runTest(form.providerName, form.modelName.trim(), settingsPayload(form))}>
              <Plug /> Test connection
            </Button>
            <Button variant="ghost" onClick={() => setForm(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <CardTitle>Configured models</CardTitle>
        <div className="mt-3 flex flex-col divide-y divide-stroke">
          {data?.configs.length === 0 && <p className="py-3 text-sm text-muted">No models configured; the AI_PROVIDER / AI_MODEL environment variables are used.</p>}
          {data?.configs.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <p className="text-sm font-semibold">
                  {c.modelName} <span className="font-normal capitalize text-muted">· {c.providerName}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  max {c.effective.maxOutputTokens} tokens · timeout {c.effective.timeoutMs / 1000}s
                  {c.effective.effort ? ` · effort ${c.effective.effort}` : ""}
                  {c.effective.temperature !== undefined ? ` · temperature ${c.effective.temperature}` : ""}
                </p>
                <div className="mt-1 flex gap-1.5">
                  {c.active && <Badge tone="success">active</Badge>}
                  {c.isFallback && <Badge tone="brand">approved fallback</Badge>}
                  {!c.enabled && <Badge>disabled</Badge>}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {!c.active && (
                  <Button size="sm" disabled={!c.enabled} onClick={() => run(() => api("/api/admin/ai-settings", { method: "PATCH", json: { action: "activate", id: c.id } }))}>
                    Activate
                  </Button>
                )}
                {!c.active && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => run(() => api("/api/admin/ai-settings", { method: "PATCH", json: { action: "setFallback", id: c.isFallback ? null : c.id } }))}
                  >
                    <Star /> {c.isFallback ? "Remove fallback" : "Use as fallback"}
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => runTest(c.providerName, c.modelName, c.settings)}>
                  <Plug /> Test
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setForm({
                      id: c.id,
                      providerName: c.providerName,
                      modelName: c.modelName,
                      enabled: c.enabled,
                      maxOutputTokens: String(c.settings.maxOutputTokens ?? ""),
                      timeoutMs: String(c.settings.timeoutMs ?? ""),
                      temperature: c.settings.temperature !== undefined ? String(c.settings.temperature) : "",
                      effort: c.settings.effort ?? "low",
                    })
                  }
                >
                  Edit
                </Button>
                {!c.active && (
                  <Button size="sm" variant="destructive" onClick={() => confirm("Delete this configuration?") && run(() => api("/api/admin/ai-settings", { method: "PATCH", json: { action: "delete", id: c.id } }))}>
                    <Trash2 />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          The fallback model is used only when the active model is unavailable, and only if you approve it here. Choosing a fallback from another provider means investor questions may be sent to that provider.
        </p>
      </Card>

      {chat && (
        <Card className="mt-6">
          <CardTitle>Assistant behaviour and request limits</CardTitle>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="md:col-span-3">
              <Label>Additional system guidance (appended to the built-in compliance rules, which cannot be removed)</Label>
              <Textarea rows={4} value={chat.systemPromptAddendum} onChange={(e) => setChat({ ...chat, systemPromptAddendum: e.target.value })} />
            </div>
            <div>
              <Label>Requests per minute per visitor</Label>
              <Input type="number" min={1} placeholder="env default (12)" value={chat.rateLimitPerMinute ?? ""} onChange={(e) => setChat({ ...chat, rateLimitPerMinute: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <div>
              <Label>Requests per day per visitor</Label>
              <Input type="number" min={1} placeholder="env default (300)" value={chat.rateLimitPerDay ?? ""} onChange={(e) => setChat({ ...chat, rateLimitPerDay: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <div>
              <Label>Maximum message length</Label>
              <Input type="number" min={100} max={4000} value={chat.maxMessageLength} onChange={(e) => setChat({ ...chat, maxMessageLength: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Conversation turns sent as context</Label>
              <Input type="number" min={0} max={30} value={chat.maxHistoryMessages} onChange={(e) => setChat({ ...chat, maxHistoryMessages: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Minimum semantic relevance (0-1)</Label>
              <Input type="number" min={0} max={1} step={0.05} value={chat.minRelevance} onChange={(e) => setChat({ ...chat, minRelevance: Number(e.target.value) })} />
            </div>
          </div>
          <Button className="mt-4" onClick={saveChat}>
            Save
          </Button>
        </Card>
      )}

      <Card className="mt-6">
        <CardTitle>Recent AI errors</CardTitle>
        <ul className="mt-3 flex flex-col gap-1 text-xs">
          {data?.recentErrors.length === 0 && <li className="text-muted">No recent errors.</li>}
          {data?.recentErrors.map((e) => (
            <li key={e.id} className="rounded-lg bg-smoke px-2 py-1.5">
              <span className="text-muted">{fmtDate(e.timestamp)}</span> · {e.provider ?? "-"} · <strong>{e.code}</strong> · {e.message}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
