"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/components/admin/api";
import { AuthFrame } from "@/components/admin/auth-frame";

export default function SetupPage() {
  const [form, setForm] = useState({ setupToken: "", name: "", email: "", password: "" });
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ setupAvailable: boolean }>("/api/admin/auth/setup")
      .then((r) => setAvailable(r.setupAvailable))
      .catch((e) => setError((e as Error).message));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/auth/setup", { method: "POST", json: form });
      window.location.href = "/admin";
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <AuthFrame title="First-time setup">
      {available === false ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">Setup is complete. Please sign in with an existing administrator account.</p>
          <Link href="/admin/login" className={buttonVariants()}>
            Go to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="text-xs text-muted">
            Create the first owner account. The setup token is the value of the <code>ADMIN_AUTH_SECRET</code> environment variable in Railway. This page stops working once an administrator exists.
          </p>
          <div>
            <Label htmlFor="token">Setup token</Label>
            <Input id="token" type="password" autoComplete="off" required value={form.setupToken} onChange={set("setupToken")} />
          </div>
          <div>
            <Label htmlFor="name">Your name</Label>
            <Input id="name" required value={form.name} onChange={set("name")} />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="username" required value={form.email} onChange={set("email")} />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="new-password" required value={form.password} onChange={set("password")} />
            <p className="mt-1 text-[11px] text-muted">At least 12 characters with upper- and lower-case letters and a number.</p>
          </div>
          {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
          <Button type="submit" disabled={busy || available === null}>{busy ? "Creating…" : "Create owner account"}</Button>
        </form>
      )}
    </AuthFrame>
  );
}
