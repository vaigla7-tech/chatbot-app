"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/components/admin/api";
import { AuthFrame } from "@/components/admin/auth-frame";

export default function ResetPasswordPage() {
  const [form, setForm] = useState({ setupToken: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/auth/reset", { method: "POST", json: form });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <AuthFrame title="Reset password">
      {done ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">Your password has been changed and all previous sessions were signed out.</p>
          <Link href="/admin/login" className="text-sm font-semibold text-ocean underline">
            Go to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="text-xs text-muted">
            Enter the value of the <code>ADMIN_AUTH_SECRET</code> variable from Railway (chatbot-app → Variables) as the setup token, your administrator email and a new password.
          </p>
          <div>
            <Label htmlFor="token">Setup token</Label>
            <Input id="token" type="password" autoComplete="off" required value={form.setupToken} onChange={set("setupToken")} />
          </div>
          <div>
            <Label htmlFor="email">Administrator email</Label>
            <Input id="email" type="email" autoComplete="username" required value={form.email} onChange={set("email")} />
          </div>
          <div>
            <Label htmlFor="password">New password</Label>
            <Input id="password" type="password" autoComplete="new-password" required value={form.password} onChange={set("password")} />
            <p className="mt-1 text-[11px] text-muted">At least 12 characters with upper- and lower-case letters and a number.</p>
          </div>
          {error && (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Set new password"}
          </Button>
          <Link href="/admin/login" className="text-center text-xs text-ocean underline">
            Back to sign in
          </Link>
        </form>
      )}
    </AuthFrame>
  );
}
