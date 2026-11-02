import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/admin-route";
import { ApiError } from "@/lib/http";
import { getAdapter } from "@/lib/ai/registry";
import { ProviderError, PROVIDER_NAMES, type ProviderName } from "@/lib/ai/types";

export const dynamic = "force-dynamic";

/** GET /api/admin/ai-settings/models?provider=anthropic - live model list from the provider. */
export const GET = adminRoute("ADMIN", async (req) => {
  const provider = new URL(req.url).searchParams.get("provider") as ProviderName;
  if (!PROVIDER_NAMES.includes(provider)) throw new ApiError("validation_error", "Unknown provider");
  try {
    return NextResponse.json({ models: await getAdapter(provider).listModels() });
  } catch (error) {
    const message = error instanceof ProviderError ? error.message : "Could not list models";
    return NextResponse.json({ models: [], error: message });
  }
});
