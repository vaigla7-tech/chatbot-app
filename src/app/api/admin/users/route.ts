import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { adminRoute } from "@/lib/admin-route";
import { ApiError, readJson } from "@/lib/http";
import { hashPassword, passwordProblems } from "@/lib/auth/password";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const select = { id: true, email: true, name: true, role: true, disabled: true, lastLoginAt: true, createdAt: true } as const;

export const GET = adminRoute("OWNER", async () => {
  return NextResponse.json({ users: await prisma.adminUser.findMany({ select, orderBy: { createdAt: "asc" } }) });
});

const createSchema = z
  .object({
    email: z.string().email().max(200),
    name: z.string().trim().min(1).max(100),
    role: z.enum(["OWNER", "ADMIN", "EDITOR", "VIEWER"]),
    password: z.string().min(1).max(200),
  })
  .strict();

export const POST = adminRoute("OWNER", async (req, user) => {
  const body = await readJson(req, createSchema);
  const problems = passwordProblems(body.password);
  if (problems.length) throw new ApiError("validation_error", `Password needs ${problems.join(", ")}`);
  const created = await prisma.adminUser.create({
    data: { email: body.email.toLowerCase(), name: body.name, role: body.role, passwordHash: await hashPassword(body.password) },
    select,
  });
  await audit(user.id, "admin_user_created", "AdminUser", created.id, { role: created.role });
  return NextResponse.json({ user: created }, { status: 201 });
});
