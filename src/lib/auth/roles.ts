import type { AdminRole } from "@prisma/client";

const RANK: Record<AdminRole, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2, OWNER: 3 };

export function hasRole(actual: AdminRole, required: AdminRole): boolean {
  return RANK[actual] >= RANK[required];
}

export const ROLE_LABELS: Record<AdminRole, string> = {
  OWNER: "Owner",
  ADMIN: "Administrator",
  EDITOR: "Content editor",
  VIEWER: "Viewer",
};
