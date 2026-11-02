"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Eye, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { api, fmtDate } from "@/components/admin/api";
import { Empty, ErrorNote, PageHeader } from "@/components/admin/shell";
import type { Category } from "@/components/admin/types";
import { LANGUAGES, LANGUAGE_CODES } from "@/lib/languages";

interface Source {
  id: string;
  url: string;
  title: string | null;
  enabled: boolean;
  approvalStatus: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  language: string;
  syncEnabled: boolean;
  lastFetchedAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  contentHash: string | null;
  pendingContentHash: string | null;
  documentId: string | null;
  category: { id: string; name: string };
}

export default function WebsitePage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [hosts, setHosts] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({ url: "", categoryId: "", language: "en" });
  const [preview, setPreview] = useState<{ id: string; title: string | null; url: string; pendingContent: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([
        api<{ sources: Source[]; allowedHosts: string[] }>("/api/admin/website-sources"),
        api<{ categories: Category[] }>("/api/admin/categories"),
      ]);
      setSources(s.sources);
      setHosts(s.allowedHosts);
      setCategories(c.categories);
      setForm((f) => ({ ...f, categoryId: f.categoryId || c.categories[0]?.id || "" }));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openPreview = (id: string) =>
    run(async () => {
      const r = await api<{ source: { id: string; title: string | null; url: string; pendingContent: string | null } }>(`/api/admin/website-sources/${id}`);
      setPreview(r.source);
    });

  return (
    <>
      <PageHeader
        title="Website Sources"
        description="Import authorised public pages from the official website. Content is fetched, previewed and used in answers only after you approve it. Automatic re-checking is off by default and still requires approval for changes."
      />
      <ErrorNote message={error} />
      <Card>
        <CardTitle>Add a page</CardTitle>
        <p className="mt-1 text-xs text-muted">
          Allowed hosts: {hosts.join(", ") || "none"} (set <code>WEBSITE_ALLOWED_HOSTS</code>). Only public https pages are accepted; private networks are blocked.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
          <div>
            <Label>URL</Label>
            <Input placeholder="https://www.lendermarket.com/…" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Language</Label>
            <Select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
              {LANGUAGE_CODES.map((c) => (
                <option key={c} value={c}>
                  {LANGUAGES[c].name}
                </option>
              ))}
            </Select>
          </div>
          <Button
            disabled={busy || !form.url}
            onClick={() =>
              run(async () => {
                await api("/api/admin/website-sources", { method: "POST", json: form });
                setForm({ ...form, url: "" });
              })
            }
          >
            <Plus /> Fetch
          </Button>
        </div>
      </Card>

      <Card className="mt-6">
        <CardTitle>Sources</CardTitle>
        <div className="mt-3 flex flex-col divide-y divide-stroke">
          {sources.length === 0 && <Empty>No website sources yet.</Empty>}
          {sources.map((s) => (
            <div key={s.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{s.title ?? s.url}</p>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-ocean underline">
                  {s.url}
                </a>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge tone={s.approvalStatus === "APPROVED" ? "success" : s.approvalStatus === "REJECTED" ? "neutral" : "warning"}>
                    {s.approvalStatus.replace("_", " ").toLowerCase()}
                  </Badge>
                  {s.pendingContentHash && <Badge tone="warning">{s.contentHash ? "changes awaiting approval" : "preview ready"}</Badge>}
                  {!s.enabled && <Badge>disabled</Badge>}
                  <Badge>{s.language.toUpperCase()}</Badge>
                  <Badge>{s.category.name}</Badge>
                  <span className="text-xs text-muted">checked {fmtDate(s.lastCheckedAt)}</span>
                </div>
                {s.lastError && <p className="mt-1 text-xs text-red-700">Last fetch failed: {s.lastError}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {s.pendingContentHash && (
                  <Button size="sm" onClick={() => openPreview(s.id)}>
                    <Eye /> Review
                  </Button>
                )}
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => api(`/api/admin/website-sources/${s.id}/sync`, { method: "POST" }))}>
                  <RefreshCw /> Check now
                </Button>
                <label className="flex items-center gap-1 text-xs" title="Phase 2: re-check on the configured schedule">
                  <input
                    type="checkbox"
                    checked={s.syncEnabled}
                    onChange={(e) => run(() => api(`/api/admin/website-sources/${s.id}`, { method: "PATCH", json: { action: "update", syncEnabled: e.target.checked } }))}
                  />
                  Auto-check
                </label>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => run(() => api(`/api/admin/website-sources/${s.id}`, { method: "PATCH", json: { action: "update", enabled: !s.enabled } }))}
                >
                  {s.enabled ? "Disable" : "Enable"}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => confirm("Delete this source?") && run(() => api(`/api/admin/website-sources/${s.id}`, { method: "DELETE" }))}>
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {preview && (
        <div className="fixed inset-0 z-40 flex justify-end bg-blackblue/30" onClick={() => setPreview(null)}>
          <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-stroke p-4">
              <div className="min-w-0">
                <h2 className="truncate font-semibold">Review: {preview.title ?? preview.url}</h2>
                <p className="text-xs text-muted">Check that this is official, accurate and free of unrelated content before approving.</p>
              </div>
              <Button variant="ghost" size="iconSm" onClick={() => setPreview(null)} aria-label="Close">
                <X />
              </Button>
            </div>
            <pre className="flex-1 overflow-auto whitespace-pre-wrap p-4 text-xs">{preview.pendingContent ?? "Nothing pending."}</pre>
            <div className="flex gap-2 border-t border-stroke p-4">
              <Button
                onClick={() =>
                  run(async () => {
                    await api(`/api/admin/website-sources/${preview.id}`, { method: "PATCH", json: { action: "approve" } });
                    setPreview(null);
                  })
                }
              >
                <CheckCircle2 /> Approve and publish
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  run(async () => {
                    await api(`/api/admin/website-sources/${preview.id}`, { method: "PATCH", json: { action: "reject" } });
                    setPreview(null);
                  })
                }
              >
                Reject
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
