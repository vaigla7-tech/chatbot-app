import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth/session";
import { AdminShell } from "@/components/admin/shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin · Lendermarket AI Assistant" };

/** Server-side authorization for every dashboard page. */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let user = null;
  try {
    user = await getSessionUser();
  } catch {
    user = null;
  }
  if (!user) redirect("/admin/login");
  return <AdminShell user={{ name: user.name, email: user.email, role: user.role }}>{children}</AdminShell>;
}
