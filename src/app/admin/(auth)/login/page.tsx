"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/components/admin/api";
import { AuthFrame } from "@/components/admin/auth-frame";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [setupAvailable, setSetupAvailable] = useState(false);

  useEffect(() => {
    api<{ setupAvailable: boolean }>("/api/admin/auth/setup")
      .then((r) => setSetupAvailable(r.setupAvailable))
      .catch(() => undefined);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/auth/login", { method: "POST", json: { email, password } });
      window.location.href = "/admin";
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame title="Administrator sign in">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
        <Link href="/admin/reset" className="text-center text-xs text-ocean underline">
          Forgot your password?
        </Link>
        {setupAvailable && (
          <p className="text-center text-xs text-muted">
            No administrator exists yet. <Link className="font-semibold text-ocean underline" href="/admin/setup">Run first-time setup</Link>
          </p>
        )}
      </form>
    </AuthFrame>
  );
}
