"use client";

import { useEffect, useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { api, fmtDate } from "@/components/admin/api";
import { ErrorNote, PageHeader } from "@/components/admin/shell";

interface Entry {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: unknown;
  timestamp: string;
  adminUser: { email: string; name: string } | null;
}
interface OpError {
  id: string;
  timestamp: string;
  source: string;
  provider: string | null;
  code: string;
  message: string;
}

export default function AuditPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [errors, setErrors] = useState<OpError[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<{ entries: Entry[] }>("/api/admin/audit").then((r) => setEntries(r.entries)),
      api<{ errors: OpError[] }>("/api/admin/errors").then((r) => setErrors(r.errors)),
    ]).catch((e) => setError((e as Error).message));
  }, []);

  return (
    <>
      <PageHeader title="Audit & Errors" description="Private administrative audit log and sanitized operational errors (no investor messages or secrets are logged)." />
      <ErrorNote message={error} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Audit log (latest 200)</CardTitle>
          <ul className="mt-3 flex max-h-[70vh] flex-col gap-1 overflow-y-auto text-xs">
            {entries.map((e) => (
              <li key={e.id} className="rounded-lg bg-smoke px-2 py-1.5">
                <span className="text-muted">{fmtDate(e.timestamp)}</span> · <strong>{e.action}</strong> · {e.targetType}
                {e.targetId ? ` ${e.targetId.slice(0, 10)}` : ""} · {e.adminUser?.email ?? "system"}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardTitle>Operational errors (latest 100)</CardTitle>
          <ul className="mt-3 flex max-h-[70vh] flex-col gap-1 overflow-y-auto text-xs">
            {errors.length === 0 && <li className="text-muted">No errors recorded.</li>}
            {errors.map((e) => (
              <li key={e.id} className="rounded-lg bg-smoke px-2 py-1.5">
                <span className="text-muted">{fmtDate(e.timestamp)}</span> · {e.source}
                {e.provider ? `/${e.provider}` : ""} · <strong>{e.code}</strong> · {e.message}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
