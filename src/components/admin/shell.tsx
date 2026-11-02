"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  BookOpen,
  Bot,
  Globe,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  ScrollText,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "./api";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, minRole: "VIEWER" },
  { href: "/admin/knowledge", label: "Knowledge Base", icon: BookOpen, minRole: "VIEWER" },
  { href: "/admin/faqs", label: "FAQ Management", icon: MessageSquareText, minRole: "VIEWER" },
  { href: "/admin/website", label: "Website Sources", icon: Globe, minRole: "VIEWER" },
  { href: "/admin/ai-settings", label: "AI Settings", icon: Bot, minRole: "VIEWER" },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3, minRole: "VIEWER" },
  { href: "/admin/settings", label: "Settings", icon: Settings, minRole: "VIEWER" },
  { href: "/admin/users", label: "Administrators", icon: Users, minRole: "OWNER" },
  { href: "/admin/audit", label: "Audit & Errors", icon: ScrollText, minRole: "ADMIN" },
] as const;

const RANK = { VIEWER: 0, EDITOR: 1, ADMIN: 2, OWNER: 3 } as const;
export type Role = keyof typeof RANK;
export const canEdit = (role: Role, needed: Role) => RANK[role] >= RANK[needed];

export function AdminShell({ user, children }: { user: { name: string; email: string; role: Role }; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const logout = async () => {
    await api("/api/admin/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/admin/login";
  };

  return (
    <div className="flex min-h-dvh bg-smoke/60">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-stroke bg-white transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-2 border-b border-stroke px-5 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/lendermarket-logo-black.svg" alt="Lendermarket" className="h-5 w-auto" />
        </div>
        <p className="px-5 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted">AI Copilot admin</p>
        <nav className="flex flex-1 flex-col gap-0.5 p-3">
          {NAV.filter((n) => canEdit(user.role, n.minRole)).map((item) => {
            const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium",
                  active ? "bg-lilac text-ocean" : "text-ink hover:bg-smoke",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-stroke p-4 text-xs">
          <p className="font-semibold">{user.name}</p>
          <p className="truncate text-muted">{user.email}</p>
          <p className="mt-0.5 text-muted">Role: {user.role}</p>
          <button onClick={logout} className="mt-3 inline-flex items-center gap-1.5 font-semibold text-ocean hover:underline">
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-20 bg-blackblue/30 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-stroke bg-white px-4 py-3 lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="Open navigation" className="rounded-lg p-1.5 hover:bg-smoke">
            <Menu className="size-5" />
          </button>
          <span className="text-sm font-semibold">AI Copilot admin</span>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
      {message}
    </p>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-stroke bg-white px-4 py-8 text-center text-sm text-muted">{children}</p>;
}
