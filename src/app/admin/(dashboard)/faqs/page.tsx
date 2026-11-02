"use client";

import { useCallback, useEffect, useState } from "react";
import { Languages, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { api, fmtDate } from "@/components/admin/api";
import { Empty, ErrorNote, PageHeader } from "@/components/admin/shell";
import type { Category } from "@/components/admin/types";
import { LANGUAGES, LANGUAGE_CODES } from "@/lib/languages";

interface Faq {
  id: string;
  translationGroupId: string;
  question: string;
  answer: string;
  language: string;
  sourceUrl: string | null;
  approvalStatus: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  isExample: boolean;
  updatedAt: string;
  category: { id: string; name: string };
}

type Draft = {
  id?: string;
  translationGroupId?: string;
  question: string;
  answer: string;
  categoryId: string;
  language: string;
  sourceUrl: string;
  approvalStatus: Faq["approvalStatus"];
};

const empty: Draft = { question: "", answer: "", categoryId: "", language: "en", sourceUrl: "", approvalStatus: "DRAFT" };
const TONE = { DRAFT: "warning", PUBLISHED: "success", ARCHIVED: "neutral" } as const;

export default function FaqPage() {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState("");
  const [status, setStatus] = useState("");
  const [importText, setImportText] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams({ ...(language ? { language } : {}), ...(status ? { status } : {}) });
      const [f, c] = await Promise.all([
        api<{ faqs: Faq[] }>(`/api/admin/faqs?${q}`),
        api<{ categories: Category[] }>("/api/admin/categories"),
      ]);
      setFaqs(f.faqs);
      setCategories(c.categories);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [language, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!draft) return;
    setError(null);
    const body = {
      question: draft.question,
      answer: draft.answer,
      categoryId: draft.categoryId,
      language: draft.language,
      sourceUrl: draft.sourceUrl || null,
      approvalStatus: draft.approvalStatus,
      ...(draft.id ? {} : draft.translationGroupId ? { translationGroupId: draft.translationGroupId } : {}),
    };
    try {
      if (draft.id) await api(`/api/admin/faqs/${draft.id}`, { method: "PUT", json: body });
      else await api("/api/admin/faqs", { method: "POST", json: body });
      setDraft(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const setFaqStatus = async (f: Faq, approvalStatus: Faq["approvalStatus"]) => {
    try {
      await api(`/api/admin/faqs/${f.id}`, { method: "PUT", json: { approvalStatus } });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (f: Faq) => {
    if (!confirm("Delete this FAQ permanently?")) return;
    try {
      await api(`/api/admin/faqs/${f.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const runImport = async () => {
    if (!importText) return;
    try {
      const parsed = JSON.parse(importText);
      const res = await api<{ imported: number }>("/api/admin/faqs/import", { method: "POST", json: Array.isArray(parsed) ? { faqs: parsed } : parsed });
      alert(`Imported ${res.imported} FAQs as drafts. Review and publish them below.`);
      setImportText(null);
      await load();
    } catch (e) {
      setError(e instanceof SyntaxError ? "The JSON is not valid." : (e as Error).message);
    }
  };

  // Which languages already exist for each translation group.
  const groups = new Map<string, Set<string>>();
  for (const f of faqs) groups.set(f.translationGroupId, (groups.get(f.translationGroupId) ?? new Set()).add(f.language));

  return (
    <>
      <PageHeader
        title="FAQ Management"
        description="Approved questions and answers. Only published FAQs are used in live answers. Translations of the same FAQ share a translation group."
        actions={
          <>
            <Button variant="secondary" onClick={() => setImportText(importText === null ? "" : null)}>
              <Upload /> Import JSON
            </Button>
            <Button onClick={() => setDraft({ ...empty, categoryId: categories[0]?.id ?? "" })}>
              <Plus /> New FAQ
            </Button>
          </>
        }
      />
      <ErrorNote message={error} />

      {importText !== null && (
        <Card className="mb-6">
          <CardTitle>Import structured FAQs (JSON)</CardTitle>
          <p className="mt-1 text-xs text-muted">
            Format: <code>{`{"faqs":[{"question":"…","answer":"…","language":"en","category":"auto-invest","sourceUrl":"https://…","group":"optional-translation-key"}]}`}</code>. Category values are slugs. Entries are imported as drafts.
          </p>
          <Textarea className="mt-3 font-mono text-xs" rows={8} value={importText} onChange={(e) => setImportText(e.target.value)} />
          <div className="mt-3 flex gap-2">
            <label className="inline-flex cursor-pointer items-center rounded-full border border-stroke px-4 py-2 text-sm font-semibold hover:bg-lilac">
              Choose file
              <input type="file" accept=".json,application/json" className="hidden" onChange={async (e) => setImportText(await e.target.files?.[0]?.text() ?? "")} />
            </label>
            <Button onClick={runImport} disabled={!importText?.trim()}>
              Import
            </Button>
          </div>
        </Card>
      )}

      {draft && (
        <Card className="mb-6">
          <CardTitle>{draft.id ? "Edit FAQ" : draft.translationGroupId ? "Add translation" : "New FAQ"}</CardTitle>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div>
              <Label>Language</Label>
              <Select value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value })}>
                {LANGUAGE_CODES.map((c) => (
                  <option key={c} value={c}>
                    {LANGUAGES[c].name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={draft.approvalStatus} onChange={(e) => setDraft({ ...draft, approvalStatus: e.target.value as Draft["approvalStatus"] })}>
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published (approved)</option>
                <option value="ARCHIVED">Archived</option>
              </Select>
            </div>
            <div className="md:col-span-3">
              <Label>Question</Label>
              <Input value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })} />
            </div>
            <div className="md:col-span-3">
              <Label>Approved answer</Label>
              <Textarea rows={5} value={draft.answer} onChange={(e) => setDraft({ ...draft, answer: e.target.value })} />
            </div>
            <div className="md:col-span-3">
              <Label>Source reference URL</Label>
              <Input placeholder="https://…" value={draft.sourceUrl} onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })} />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={save}>Save</Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap gap-2">
          <Select className="w-auto" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="">All languages</option>
            {LANGUAGE_CODES.map((c) => (
              <option key={c} value={c}>
                {LANGUAGES[c].name}
              </option>
            ))}
          </Select>
          <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
          </Select>
        </div>
        <div className="mt-4 flex flex-col divide-y divide-stroke">
          {faqs.length === 0 && <Empty>No FAQs match these filters.</Empty>}
          {faqs.map((f) => {
            const missing = LANGUAGE_CODES.filter((c) => !groups.get(f.translationGroupId)?.has(c));
            return (
              <div key={f.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{f.question}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{f.answer}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge tone={TONE[f.approvalStatus]}>{f.approvalStatus.toLowerCase()}</Badge>
                      <Badge>{f.language.toUpperCase()}</Badge>
                      <Badge>{f.category.name}</Badge>
                      {f.isExample && <Badge tone="warning">example - not official</Badge>}
                      <span className="text-xs text-muted">updated {fmtDate(f.updatedAt)}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setDraft({
                          id: f.id,
                          question: f.question,
                          answer: f.answer,
                          categoryId: f.category.id,
                          language: f.language,
                          sourceUrl: f.sourceUrl ?? "",
                          approvalStatus: f.approvalStatus,
                        })
                      }
                    >
                      Edit
                    </Button>
                    {f.approvalStatus !== "PUBLISHED" ? (
                      <Button size="sm" onClick={() => setFaqStatus(f, "PUBLISHED")}>
                        Publish
                      </Button>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => setFaqStatus(f, "ARCHIVED")}>
                        Archive
                      </Button>
                    )}
                    {missing.length > 0 && (
                      <Button
                        size="sm"
                        variant="secondary"
                        title={`Missing: ${missing.join(", ").toUpperCase()}`}
                        onClick={() =>
                          setDraft({ ...empty, translationGroupId: f.translationGroupId, categoryId: f.category.id, language: missing[0]!, sourceUrl: f.sourceUrl ?? "" })
                        }
                      >
                        <Languages /> Translate
                      </Button>
                    )}
                    <Button size="sm" variant="destructive" onClick={() => remove(f)}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
