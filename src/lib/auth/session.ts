import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { AdminRole, AdminUser } from "@prisma/client";
import { prisma } from "../db";
import { env } from "../env";
import { ApiError } from "../http";
import { hasRole } from "./roles";

export const SESSION_COOKIE = "lm_admin_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

export type SessionUser = Pick<AdminUser, "id" | "email" | "name" | "role">;

function secret(): string {
  const value = env().ADMIN_AUTH_SECRET;
  if (!value || value.length < 32) throw new ApiError("internal_error", "ADMIN_AUTH_SECRET is not configured");
  return value;
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Cookie value = token.signature; the database stores only sha256(token). */
function sign(token: string): string {
  return `${token}.${createHmac("sha256", secret()).update(token).digest("base64url")}`;
}

function unsign(value: string): string | null {
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const token = value.slice(0, dot);
  const expected = Buffer.from(sign(token));
  const actual = Buffer.from(value);
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? token : null;
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.adminSession.create({ data: { tokenHash: sha256(token), adminUserId: userId, expiresAt } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sign(token), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw) {
    const token = unsign(raw);
    if (token) await prisma.adminSession.deleteMany({ where: { tokenHash: sha256(token) } });
  }
  jar.delete(SESSION_COOKIE);
}

/** Current admin from the session cookie, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  let token: string | null;
  try {
    token = unsign(raw);
  } catch {
    return null;
  }
  if (!token) return null;
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: sha256(token) },
    include: { adminUser: { select: { id: true, email: true, name: true, role: true, disabled: true } } },
  });
  if (!session || session.expiresAt < new Date() || session.adminUser.disabled) return null;
  const { id, email, name, role } = session.adminUser;
  return { id, email, name, role };
}

/**
 * Server-side authorization for admin route handlers. Also enforces a same-origin
 * check on state-changing requests (CSRF defense in addition to SameSite=strict).
 */
export async function requireAdmin(req: Request | null, role: AdminRole = "VIEWER"): Promise<SessionUser> {
  if (req && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (!origin || !host || new URL(origin).host !== host) {
      throw new ApiError("forbidden", "Cross-origin request rejected");
    }
  }
  const user = await getSessionUser();
  if (!user) throw new ApiError("unauthorized", "Authentication required");
  if (!hasRole(user.role, role)) throw new ApiError("forbidden", "Insufficient permissions");
  return user;
}

/** Constant-time comparison for the one-time setup token. */
export function setupTokenMatches(candidate: string): boolean {
  const a = Buffer.from(sha256(candidate));
  const b = Buffer.from(sha256(secret()));
  return timingSafeEqual(a, b);
}
