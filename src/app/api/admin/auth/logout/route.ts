import { NextResponse } from "next/server";
import { destroySession, getSessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { handleRouteError, jsonError } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (!origin || !host || new URL(origin).host !== host) return jsonError("forbidden", "Cross-origin request rejected");
    const user = await getSessionUser();
    await destroySession();
    if (user) await audit(user.id, "logout", "AdminUser", user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
