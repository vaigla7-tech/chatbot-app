import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { adminRoute } from "@/lib/admin-route";
import { ApiError, readJson } from "@/lib/http";
import { hashPassword, passwordProblems } from "@/lib/auth/password";
import { audit } from "@/lib/audit";

const schema = z
  .object({
    role: z.enum(["OWNER", "ADMIN", "EDITOR", "VIEWER"]).optional(),
    disabled: z.boolean().optional(),
    password: z.string().min(1).max(200).optional(),
    name: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export const PATCH = adminRoute<{ id: string }>("OWNER", async (req, user, { id }) => {
  const body = await readJson(req, schema);
  if (id === user.id && (body.disabled || (body.role && body.role !== "OWNER"))) {
    throw new ApiError("conflict", "You cannot disable or demote your own account");
  }
  if (body.password) {
    const problems = passwordProblems(body.password);
    if (problems.length) throw new ApiError("validation_error", `Password needs ${problems.join(", ")}`);
  }
  const updated = await prisma.adminUser.update({
    where: { id },
    data: {
      role: body.role,
      disabled: body.disabled,
      name: body.name,
      ...(body.password ? { passwordHash: await hashPassword(body.password) } : {}),
    },
    select: { id: true, email: true, name: true, role: true, disabled: true },
  });
  // Revoke sessions when access is reduced or the password changes.
  if (body.disabled || body.password || body.role) await prisma.adminSession.deleteMany({ where: { adminUserId: id } });
  await audit(user.id, "admin_user_updated", "AdminUser", id, { fields: Object.keys(body).filter((k) => k !== "password") });
  return NextResponse.json({ user: updated });
});
