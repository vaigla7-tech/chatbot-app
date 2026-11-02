import type { AdminRole } from "@prisma/client";
import { requireAdmin, type SessionUser } from "./auth/session";
import { handleRouteError } from "./http";

type Ctx<P> = { params: Promise<P> };

/** Wrap an admin route handler with authentication, role checks and safe error handling. */
export function adminRoute<P = Record<string, string>>(
  role: AdminRole,
  handler: (req: Request, user: SessionUser, params: P) => Promise<Response>,
) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      const user = await requireAdmin(req, role);
      const params = ctx?.params ? await ctx.params : ({} as P);
      return await handler(req, user, params);
    } catch (error) {
      return handleRouteError(error);
    }
  };
}
