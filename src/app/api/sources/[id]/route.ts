import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { jsonError, handleRouteError } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/sources/:id - public view of an approved document. Only documents that
 * are PUBLISHED and explicitly marked publicViewEnabled are served; everything
 * else returns 404 so unpublished material cannot be discovered.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!/^[a-z0-9]{10,40}$/i.test(id)) return jsonError("not_found", "Not found");
    const doc = await prisma.knowledgeDocument.findFirst({
      where: { id, publicationStatus: "PUBLISHED", publicViewEnabled: true, storageKey: { not: null } },
    });
    if (!doc?.storageKey) return jsonError("not_found", "Not found");
    const file = await storage().get(doc.storageKey);
    if (!file) return jsonError("not_found", "Not found");
    const safeName = (doc.fileName ?? "document").replace(/[^\w.\- ]+/g, "_");
    const inline = doc.mimeType === "application/pdf" || doc.mimeType?.startsWith("text/");
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": doc.mimeType?.startsWith("text/") ? "text/plain; charset=utf-8" : (doc.mimeType ?? "application/octet-stream"),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
