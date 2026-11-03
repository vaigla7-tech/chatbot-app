import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, passwordProblems } from "@/lib/auth/password";
import { setupTokenMatches } from "@/lib/auth/session";
import { clientKey, getLimiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { handleRouteError, jsonError, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    setupToken: z.string().min(1).max(500),
    email: z.string().email().max(200),
    password: z.string().min(1).max(200),
  })
  .strict();

/**
 * POST /api/admin/auth/reset - recover a forgotten administrator password.
 * Requires the ADMIN_AUTH_SECRET value (only visible to whoever controls the
 * Railway project), revokes all existing sessions of that account and is audited.
 */
export async function POST(req: Request) {
  try {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (!origin || !host || new URL(origin).host !== host) return jsonError("forbidden", "Cross-origin request rejected");
    if (!getLimiter("admin-reset", 5, 15 * 60_000).check(clientKey(req.headers)).allowed) {
      return jsonError("rate_limited", "Too many attempts. Please try again later.");
    }
    const body = await readJson(req, schema, 4096);
    if (!setupTokenMatches(body.setupToken)) return jsonError("unauthorized", "Invalid setup token");
    const problems = passwordProblems(body.password);
    if (problems.length) return jsonError("validation_error", `Password needs ${problems.join(", ")}`);
    const user = await prisma.adminUser.findUnique({ where: { email: body.email.toLowerCase() } });
    if (!user) return jsonError("not_found", "No administrator with this email address");
    await prisma.$transaction([
      prisma.adminUser.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.password), disabled: false } }),
      prisma.adminSession.deleteMany({ where: { adminUserId: user.id } }),
    ]);
    await audit(user.id, "password_reset_with_setup_token", "AdminUser", user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
