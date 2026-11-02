"use client";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

/** JSON fetch helper for the admin UI. Redirects to login when the session expired. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (res.status === 401 && typeof window !== "undefined" && !path.includes("/auth/")) {
    window.location.href = "/admin/login";
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const details = data?.error?.details;
    const detailText = Array.isArray(details) ? details.map((d: { path: string; message: string }) => `${d.path}: ${d.message}`).join("; ") : "";
    throw new ApiClientError([data?.error?.message ?? `Request failed (${res.status})`, detailText].filter(Boolean).join(" - "), res.status, details);
  }
  return data as T;
}

export const fmtDate = (value: string | Date | null | undefined) =>
  value ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "-";
export const fmtDay = (value: string | Date | null | undefined) =>
  value ? new Date(value).toLocaleDateString("en-GB", { dateStyle: "medium" }) : "-";
