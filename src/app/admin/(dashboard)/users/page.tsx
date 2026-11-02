"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { api, fmtDate } from "@/components/admin/api";
import { ErrorNote, PageHeader } from "@/components/admin/shell";

type Role = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  disabled: boolean;
  lastLoginAt: string | null;
}

const ROLE_HELP: Record<Role, string> = {
  OWNER: "Everything, including administrator accounts",
  ADMIN: "Content, AI settings, settings, audit log",
  EDITOR: "Knowledge base, FAQs and website sources",
  VIEWER: "Read-only dashboards",
};

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [form, setForm] = useState<{ email: string; name: string; role: Role; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api<{ users: AdminUser[] }>("/api/admin/users").then((r) => setUsers(r.users)).catch((e) => setError((e as Error).message)), []);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <PageHeader
        title="Administrators"
        description="Each administrator has an individual account. Changing a role, password or disabling an account signs that person out everywhere."
        actions={
          <Button onClick={() => setForm({ email: "", name: "", role: "EDITOR", password: "" })}>
            <Plus /> Add administrator
          </Button>
        }
      />
      <ErrorNote message={error} />
      {form && (
        <Card className="mb-6">
          <CardTitle>New administrator</CardTitle>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                {(Object.keys(ROLE_HELP) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {r} - {ROLE_HELP[r]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Initial password</Label>
              <Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <p className="mt-1 text-[11px] text-muted">Share it through a secure channel and ask them to change it.</p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => run(async () => { await api("/api/admin/users", { method: "POST", json: form }); setForm(null); })}>Create</Button>
            <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
          </div>
        </Card>
      )}
      <Card>
        <div className="flex flex-col divide-y divide-stroke">
          {users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <p className="text-sm font-semibold">{u.name}</p>
                <p className="text-xs text-muted">{u.email} · last login {fmtDate(u.lastLoginAt)}</p>
                <div className="mt-1 flex gap-1.5">
                  <Badge tone="brand">{u.role}</Badge>
                  {u.disabled && <Badge tone="danger">disabled</Badge>}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Select className="h-8 w-auto text-xs" value={u.role} onChange={(e) => run(() => api(`/api/admin/users/${u.id}`, { method: "PATCH", json: { role: e.target.value } }))}>
                  {(Object.keys(ROLE_HELP) as Role[]).map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const password = prompt("New password (min. 12 characters, upper/lower case and a number)");
                    if (password) void run(() => api(`/api/admin/users/${u.id}`, { method: "PATCH", json: { password } }));
                  }}
                >
                  Reset password
                </Button>
                <Button size="sm" variant={u.disabled ? "secondary" : "destructive"} onClick={() => run(() => api(`/api/admin/users/${u.id}`, { method: "PATCH", json: { disabled: !u.disabled } }))}>
                  {u.disabled ? "Enable" : "Disable"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
