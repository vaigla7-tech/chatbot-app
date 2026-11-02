import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { clientKey, getLimiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { handleRouteError, jsonError, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

const schema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) }).strict();

// Dummy hash so unknown emails take the same time as wrong passwords.
const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==";

export async function POST(req: Request) {
  try {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (!origin || !host || new URL(origin).host !== host) return jsonError("forbidden", "Cross-origin request rejected");

    const ip = clientKey(req.headers);
    if (!getLimiter("admin-login", 8, 15 * 60_000).check(ip).allowed) {
      return jsonError("rate_limited", "Too many login attempts. Please try again later.");
    }
    const { email, password } = await readJson(req, schema, 2048);
    const user = await prisma.adminUser.findUnique({ where: { email: email.toLowerCase() } });
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok || user.disabled) {
      await audit(user?.id ?? null, "login_failed", "AdminUser", user?.id ?? null);
      return jsonError("unauthorized", "Invalid email or password");
    }
    await createSession(user.id);
    await prisma.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit(user.id, "login", "AdminUser", user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
