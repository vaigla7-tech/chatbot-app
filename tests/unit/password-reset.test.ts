import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { id: "u1", email: "owner@example.com", passwordHash: "old", disabled: false } as Record<string, unknown> | null,
  sessionsDeleted: 0,
  updated: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    adminUser: {
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) => (db.user && where.email === db.user.email ? db.user : null)),
      update: vi.fn((args: { data: Record<string, unknown> }) => {
        db.updated = args.data;
        return Promise.resolve(args);
      }),
    },
    adminSession: { deleteMany: vi.fn(() => { db.sessionsDeleted++; return Promise.resolve({ count: 2 }); }) },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    auditLog: { create: vi.fn(async () => ({})) },
  },
  isDatabaseUnavailable: () => false,
}));

import { POST } from "@/app/api/admin/auth/reset/route";
import { verifyPassword } from "@/lib/auth/password";

const SECRET = process.env.ADMIN_AUTH_SECRET!;
let ip = 0;
const call = (body: unknown, origin = "http://localhost") =>
  POST(
    new Request("http://localhost/api/admin/auth/reset", {
      method: "POST",
      headers: { "content-type": "application/json", origin, host: "localhost", "x-forwarded-for": `10.1.1.${++ip}` },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  db.updated = null;
  db.sessionsDeleted = 0;
});

describe("admin password reset", () => {
  it("resets the password with the setup token and revokes sessions", async () => {
    const res = await call({ setupToken: SECRET, email: "Owner@Example.com", password: "BrandNewPassw0rd" });
    expect(res.status).toBe(200);
    expect(await verifyPassword("BrandNewPassw0rd", db.updated?.passwordHash as string)).toBe(true);
    expect(db.sessionsDeleted).toBe(1);
  });

  it("rejects a wrong setup token", async () => {
    const res = await call({ setupToken: "wrong", email: "owner@example.com", password: "BrandNewPassw0rd" });
    expect(res.status).toBe(401);
    expect(db.updated).toBeNull();
  });

  it("rejects weak passwords, unknown emails and cross-origin requests", async () => {
    expect((await call({ setupToken: SECRET, email: "owner@example.com", password: "short" })).status).toBe(422);
    expect((await call({ setupToken: SECRET, email: "nobody@example.com", password: "BrandNewPassw0rd" })).status).toBe(404);
    expect((await call({ setupToken: SECRET, email: "owner@example.com", password: "BrandNewPassw0rd" }, "https://evil.example")).status).toBe(403);
    expect(db.updated).toBeNull();
  });
});
