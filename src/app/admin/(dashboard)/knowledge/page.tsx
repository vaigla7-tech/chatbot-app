"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, CheckCircle2, FileUp, History, RefreshCw, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { api, fmtDate, fmtDay } from "@/components/admin/api";
import { Empty, ErrorNote, PageHeader } from "@/components/admin/shell";
import type { Category } from "@/components/admin/types";
import { LANGUAGES, LANGUAGE_CODES } from "@/lib/languages";
import { cn } from "@/lib/utils";

interface Doc {
  id: string;
  groupId: string;
  version: number;
  title: string;
  description: string | null;
  language: string;
  sourceType: "UPLOAD" | "WEBSITE";
  fileName: string | null;
  fileSize: number | null;
  sourceUrl: string | null;
  publicViewEnabled: boolean;
  processingStatus: "PENDING" | "PROCESSING" | "READY" | "FAILED";
  processingError: string | null;
  publicationStatus: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  effectiveAt: string | null;
  lastReviewedAt: string | null;
  updatedAt: string;
  chunkCount: number;
  category: { id: string; name: string };
}

const PROC_TONE = { PENDING: "neutral", PROCESSING: "brand", READY: "success", FAILED: "danger" } as const;
const PUB_TONE = { DRAFT: "warning", PUBLISHED: "success", ARCHIVED: "neutral" } as const;

export default function KnowledgePage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accepted, setAccepted] = useState<string[]>([]);
  const [maxBytes, setMaxBytes] = useState(20 * 1024 * 1024);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"live" | "all" | "DRAFT" | "ARCHIVED" | "FAILED">("all");
  const [replacing, setReplacing] = useState<Doc | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, c] = await Promise.all([
        api<{ documents: Doc[]; accepted: string[]; maxUploadBytes: number }>("/api/admin/documents"),
        api<{ categories: Category[] }>("/api/admin/categories"),
      ]);
      setDocs(d.documents);
      setAccepted(d.accepted);
      setMaxBytes(d.maxUploadBytes);
      setCategories(c.categories);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while documents are being processed.
  useEffect(() => {
    if (!docs.some((d) => d.processingStatus === "PENDING" || d.processingStatus === "PROCESSING")) return;
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [docs, load]);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const setStatus = (doc: Doc, publicationStatus: Doc["publicationStatus"]) =>
    act(() => api(`/api/admin/documents/${doc.id}`, { method: "PATCH", json: { publicationStatus } }));

  const visible = docs.filter((d) =>
    filter === "all"
      ? d.publicationStatus !== "ARCHIVED"
      : filter === "live"
        ? d.publicationStatus === "PUBLISHED" && d.processingStatus === "READY"
        : filter === "FAILED"
          ? d.processingStatus === "FAILED"
          : d.publicationStatus === filter,
  );

  return (
    <>
      <PageHeader
        title="Knowledge Base"
        description="Upload approved documentation. A document is used in answers only after processing succeeds AND an administrator publishes it. Publishing a new version archives the previous one."
      />
      <ErrorNote message={error} />

      <UploadCard
        categories={categories}
        accepted={accepted}
        maxBytes={maxBytes}
        replacing={replacing}
        onCancelReplace={() => setReplacing(null)}
        onUploaded={() => {
          setReplacing(null);
          void load();
        }}
      />

      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Documents</CardTitle>
          <div className="flex flex-wrap gap-1">
            {(["all", "live", "DRAFT", "FAILED", "ARCHIVED"] as const).map((f) => (
              <Button key={f} size="sm" variant={filter === f ? "default" : "secondary"} onClick={() => setFilter(f)}>
                {f === "all" ? "Active" : f === "live" ? "Live" : f.charAt(0) + f.slice(1).toLowerCase()}
              </Button>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-col divide-y divide-stroke">
          {visible.length === 0 && <Empty>No documents in this view.</Empty>}
          {visible.map((d) => (
            <div key={d.id} className="flex flex-col gap-2 py-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <button className="text-left text-sm font-semibold text-ink hover:underline" onClick={() => setDetail(d.id)}>
                  {d.title} <span className="font-normal text-muted">v{d.version}</span>
                </button>
                <p className="mt-0.5 text-xs text-muted">
                  {d.category.name} · {d.language.toUpperCase()} · {d.sourceType === "WEBSITE" ? "Website" : d.fileName} · {d.chunkCount} chunks · updated {fmtDate(d.updatedAt)}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge tone={PROC_TONE[d.processingStatus]}>{d.processingStatus.toLowerCase()}</Badge>
                  <Badge tone={PUB_TONE[d.publicationStatus]}>{d.publicationStatus.toLowerCase()}</Badge>
                  {d.sourceUrl ? <Badge tone="brand">public URL</Badge> : d.publicViewEnabled ? <Badge tone="brand">public view</Badge> : <Badge>no public link</Badge>}
                  {d.effectiveAt && <Badge>effective {fmtDay(d.effectiveAt)}</Badge>}
                </div>
                {d.processingError && <p className="mt-1 text-xs text-red-700">Ingestion failed: {d.processingError}</p>}
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {d.publicationStatus !== "PUBLISHED" && (
                  <Button size="sm" disabled={d.processingStatus !== "READY"} onClick={() => setStatus(d, "PUBLISHED")} title="Approve for live answers">
                    <CheckCircle2 /> Publish
                  </Button>
                )}
                {d.publicationStatus === "PUBLISHED" && (
                  <Button size="sm" variant="secondary" onClick={() => setStatus(d, "DRAFT")}>
                    Unpublish
                  </Button>
                )}
                {d.publicationStatus !== "ARCHIVED" && (
                  <Button size="sm" variant="secondary" onClick={() => setStatus(d, "ARCHIVED")}>
                    <Archive /> Archive
                  </Button>
                )}
                {d.sourceType === "UPLOAD" && (
                  <Button size="sm" variant="secondary" onClick={() => setReplacing(d)}>
                    <FileUp /> New version
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => act(() => api(`/api/admin/documents/${d.id}/reprocess`, { method: "POST" }))}>
                  <RefreshCw /> {d.processingStatus === "FAILED" ? "Retry" : "Reprocess"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => confirm(`Permanently delete "${d.title}" v${d.version}?`) && act(() => api(`/api/admin/documents/${d.id}`, { method: "DELETE" }))}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <CategoriesCard categories={categories} onChange={load} />

      {detail && <DocumentDetail id={detail} categories={categories} onClose={() => setDetail(null)} onSaved={load} />}
    </>
  );
}

function UploadCard(props: {
  categories: Category[];
  accepted: string[];
  maxBytes: number;
  replacing: Doc | null;
  onCancelReplace: () => void;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState({
    title: "",
    description: "",
    categoryId: "",
    language: "en",
    sourceUrl: "",
    effectiveAt: "",
    lastReviewedAt: "",
    publicViewEnabled: false,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const { replacing } = props;

  useEffect(() => {
    if (replacing) {
      setMeta((m) => ({
        ...m,
        title: replacing.title,
        description: replacing.description ?? "",
        categoryId: replacing.category.id,
        language: replacing.language,
        sourceUrl: replacing.sourceUrl ?? "",
        publicViewEnabled: replacing.publicViewEnabled,
      }));
    }
  }, [replacing]);

  const pick = (f: File | undefined | null) => {
    setError(null);
    if (!f) return;
    const ext = `.${f.name.split(".").pop()?.toLowerCase()}`;
    if (props.accepted.length && !props.accepted.includes(ext) && ext !== ".markdown") {
      setError(`Unsupported file type ${ext}. Supported formats: ${props.accepted.join(", ")}.`);
      return;
    }
    if (f.size > props.maxBytes) {
      setError(`File is ${(f.size / 1048576).toFixed(1)} MB; the limit is ${Math.round(props.maxBytes / 1048576)} MB.`);
      return;
    }
    setFile(f);
    if (!meta.title) setMeta((m) => ({ ...m, title: f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ") }));
  };

  const upload = () => {
    if (!file) return setError("Choose a file first.");
    if (!meta.categoryId) return setError("Choose a category.");
    const form = new FormData();
    form.append("file", file);
    Object.entries(meta).forEach(([k, v]) => form.append(k, String(v)));
    if (replacing) form.append("replacesDocumentId", replacing.id);
    // XMLHttpRequest gives upload progress events.
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/documents");
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setProgress(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        setFile(null);
        setMeta((m) => ({ ...m, title: "", description: "", sourceUrl: "", effectiveAt: "", lastReviewedAt: "" }));
        props.onUploaded();
      } else {
        try {
          const data = JSON.parse(xhr.responseText);
          const details = Array.isArray(data?.error?.details) ? ` (${data.error.details.map((d: { message: string }) => d.message).join("; ")})` : "";
          setError(`${data?.error?.message ?? "Upload failed"}${details}`);
        } catch {
          setError(`Upload failed (${xhr.status})`);
        }
      }
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("Network error during upload.");
    };
    setProgress(0);
    xhr.send(form);
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>{replacing ? `Upload new version of "${replacing.title}" (currently v${replacing.version})` : "Upload a document"}</CardTitle>
        {replacing && (
          <Button size="sm" variant="ghost" onClick={props.onCancelReplace}>
            <X /> Cancel
          </Button>
        )}
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files[0]);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        className={cn(
          "mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center",
          drag ? "border-brand bg-lilac" : "border-stroke bg-smoke/40 hover:bg-lilac/50",
        )}
      >
        <Upload className="size-6 text-brand" />
        <p className="mt-2 text-sm font-semibold">{file ? file.name : "Drag & drop a file, or click to choose"}</p>
        <p className="mt-1 text-xs text-muted">
          {props.accepted.join(", ") || ".pdf, .docx, .csv, .txt, .md"} · max {Math.round(props.maxBytes / 1048576)} MB · structured FAQ JSON goes to FAQ Management → Import
        </p>
        <input ref={inputRef} type="file" className="hidden" accept={props.accepted.join(",")} onChange={(e) => pick(e.target.files?.[0])} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <Label htmlFor="d-title">Title</Label>
          <Input id="d-title" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="d-cat">Category</Label>
            <Select id="d-cat" value={meta.categoryId} onChange={(e) => setMeta({ ...meta, categoryId: e.target.value })}>
              <option value="">Choose…</option>
              {props.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="d-lang">Language</Label>
            <Select id="d-lang" value={meta.language} onChange={(e) => setMeta({ ...meta, language: e.target.value })}>
              {LANGUAGE_CODES.map((c) => (
                <option key={c} value={c}>
                  {LANGUAGES[c].name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="d-desc">Description</Label>
          <Textarea id="d-desc" rows={2} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="d-url">Official source URL (used for citations)</Label>
          <Input id="d-url" placeholder="https://…" value={meta.sourceUrl} onChange={(e) => setMeta({ ...meta, sourceUrl: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="d-eff">Effective date</Label>
            <Input id="d-eff" type="date" value={meta.effectiveAt} onChange={(e) => setMeta({ ...meta, effectiveAt: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="d-rev">Last reviewed</Label>
            <Input id="d-rev" type="date" value={meta.lastReviewedAt} onChange={(e) => setMeta({ ...meta, lastReviewedAt: e.target.value })} />
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            className="mt-1 accent-[var(--brand-primary)]"
            checked={meta.publicViewEnabled}
            onChange={(e) => setMeta({ ...meta, publicViewEnabled: e.target.checked })}
          />
          <span>
            Allow investors to open this file from source citations when it has no public URL.
            <span className="block text-xs text-muted">Leave unchecked for internal-only documents; they are then cited by title without a link.</span>
          </span>
        </label>
      </div>
      {error && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <div className="mt-4 flex items-center gap-3">
        <Button onClick={upload} disabled={progress !== null}>
          <Upload /> {replacing ? "Upload new version" : "Upload"}
        </Button>
        {progress !== null && (
          <div className="flex flex-1 items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-lilac">
              <div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs tabular-nums text-muted">{progress}%</span>
          </div>
        )}
      </div>
    </Card>
  );
}

function DocumentDetail({ id, categories, onClose, onSaved }: { id: string; categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const [data, setData] = useState<{
    document: Doc & { chunks: Array<{ chunkIndex: number; heading: string | null; pageNumber: number | null; content: string }> };
    versions: Array<{ id: string; version: number; fileName: string | null; publicationStatus: string; processingStatus: string; createdAt: string }>;
  } | null>(null);
  const [form, setForm] = useState<{ title: string; description: string; categoryId: string; sourceUrl: string; publicViewEnabled: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<NonNullable<typeof data>>(`/api/admin/documents/${id}`)
      .then((d) => {
        setData(d);
        setForm({
          title: d.document.title,
          description: d.document.description ?? "",
          categoryId: d.document.category.id,
          sourceUrl: d.document.sourceUrl ?? "",
          publicViewEnabled: d.document.publicViewEnabled,
        });
      })
      .catch((e) => setError((e as Error).message));
  }, [id]);

  const save = async () => {
    if (!form) return;
    try {
      await api(`/api/admin/documents/${id}`, {
        method: "PATCH",
        json: { ...form, description: form.description || null, sourceUrl: form.sourceUrl || null, lastReviewedAt: new Date().toISOString() },
      });
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-blackblue/30" onClick={onClose}>
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Document details</h2>
          <Button variant="ghost" size="iconSm" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>
        <ErrorNote message={error} />
        {data && form && (
          <div className="mt-4 flex flex-col gap-4">
            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
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
                <Label>Source URL</Label>
                <Input value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.publicViewEnabled} onChange={(e) => setForm({ ...form, publicViewEnabled: e.target.checked })} />
              Public file view allowed
            </label>
            <Button onClick={save}>Save and mark reviewed</Button>

            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                <History className="size-4" /> Versions
              </h3>
              <ul className="mt-2 flex flex-col gap-1 text-xs">
                {data.versions.map((v) => (
                  <li key={v.id} className="flex justify-between rounded-lg bg-smoke px-2 py-1.5">
                    <span>
                      v{v.version} · {v.fileName ?? "-"} · {fmtDate(v.createdAt)}
                    </span>
                    <span className="text-muted">
                      {v.processingStatus.toLowerCase()} / {v.publicationStatus.toLowerCase()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold">Extracted chunks (first 50)</h3>
              <div className="mt-2 flex flex-col gap-2">
                {data.document.chunks.map((c) => (
                  <div key={c.chunkIndex} className="rounded-lg border border-stroke p-2 text-xs">
                    <p className="mb-1 font-semibold text-muted">
                      #{c.chunkIndex + 1}
                      {c.pageNumber ? ` · page ${c.pageNumber}` : ""}
                      {c.heading ? ` · ${c.heading}` : ""}
                    </p>
                    <p className="line-clamp-4 whitespace-pre-wrap">{c.content}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CategoriesCard({ categories, onChange }: { categories: Category[]; onChange: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setError(null);
    try {
      const slug = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      await api("/api/admin/categories", { method: "POST", json: { name, slug, sortOrder: categories.length } });
      setName("");
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const rename = async (c: Category) => {
    const next = prompt("Category name", c.name);
    if (!next || next === c.name) return;
    try {
      await api(`/api/admin/categories/${c.id}`, { method: "PATCH", json: { name: next } });
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (c: Category) => {
    if (!confirm(`Delete category "${c.name}"?`)) return;
    try {
      await api(`/api/admin/categories/${c.id}`, { method: "DELETE" });
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Card className="mt-6">
      <CardTitle>Categories</CardTitle>
      <ErrorNote message={error} />
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between rounded-lg border border-stroke px-3 py-2 text-sm">
            <span>
              {c.name}
              <span className="ml-2 text-xs text-muted">
                {c._count?.documents ?? 0} docs · {c._count?.faqs ?? 0} FAQs
              </span>
            </span>
            <span className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => rename(c)}>
                Rename
              </Button>
              <Button size="sm" variant="ghost" disabled={(c._count?.documents ?? 0) + (c._count?.faqs ?? 0) > 0} onClick={() => remove(c)}>
                <Trash2 />
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <Input placeholder="New category name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={add} disabled={!name.trim()}>
          Add
        </Button>
      </div>
    </Card>
  );
}
