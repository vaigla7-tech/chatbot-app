import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, passwordProblems } from "@/lib/auth/password";
import { createSession, setupTokenMatches } from "@/lib/auth/session";
import { clientKey, getLimiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { handleRouteError, jsonError, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    setupToken: z.string().min(1).max(500),
    email: z.string().email().max(200),
    name: z.string().trim().min(1).max(100),
    password: z.string().min(1).max(200),
  })
  .strict();

/** GET reports whether first-time setup is still available. */
export async function GET() {
  try {
    return NextResponse.json({ setupAvailable: (await prisma.adminUser.count()) === 0 });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST creates the first OWNER account. Only works while no administrator exists
 * and requires the ADMIN_AUTH_SECRET value as a one-time setup token.
 */
export async function POST(req: Request) {
  try {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (!origin || !host || new URL(origin).host !== host) return jsonError("forbidden", "Cross-origin request rejected");
    if (!getLimiter("admin-setup", 5, 15 * 60_000).check(clientKey(req.headers)).allowed) {
      return jsonError("rate_limited", "Too many attempts. Please try again later.");
    }
    const body = await readJson(req, schema, 4096);
    if ((await prisma.adminUser.count()) > 0) return jsonError("forbidden", "Setup has already been completed");
    if (!setupTokenMatches(body.setupToken)) return jsonError("unauthorized", "Invalid setup token");
    const problems = passwordProblems(body.password);
    if (problems.length) return jsonError("validation_error", `Password needs ${problems.join(", ")}`);
    const user = await prisma.adminUser.create({
      data: { email: body.email.toLowerCase(), name: body.name, role: "OWNER", passwordHash: await hashPassword(body.password) },
    });
    await audit(user.id, "setup_owner_created", "AdminUser", user.id);
    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
