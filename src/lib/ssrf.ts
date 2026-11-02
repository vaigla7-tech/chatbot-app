import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * Guards for website ingestion: only HTTPS URLs on allowlisted hosts that do not
 * resolve to private, loopback, link-local or cloud metadata addresses.
 */

export class UrlNotAllowedError extends Error {
  constructor(public readonly reason: string) {
    super(`URL not allowed: ${reason}`);
  }
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a = 0, b = 0] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local incl. 169.254.169.254 metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
    return v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("fec0") || v.startsWith("ff");
  }
  return true;
}

export function validateUrlShape(raw: string, allowedHosts: string[]): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlNotAllowedError("invalid URL");
  }
  if (url.protocol !== "https:") throw new UrlNotAllowedError("only https URLs are allowed");
  if (url.username || url.password) throw new UrlNotAllowedError("credentials in URL are not allowed");
  if (url.port && url.port !== "443") throw new UrlNotAllowedError("non-standard ports are not allowed");
  const host = url.hostname.toLowerCase();
  if (net.isIP(host)) throw new UrlNotAllowedError("IP address hosts are not allowed");
  if (!allowedHosts.includes(host)) throw new UrlNotAllowedError(`host ${host} is not on the allowlist`);
  url.hash = "";
  return url;
}

export async function assertPublicHost(hostname: string): Promise<void> {
  const records = await lookup(hostname, { all: true });
  if (records.length === 0) throw new UrlNotAllowedError("host does not resolve");
  for (const r of records) {
    if (isPrivateAddress(r.address)) throw new UrlNotAllowedError("host resolves to a private address");
  }
}

/**
 * Fetch an allowlisted public page. Redirects are followed manually so every
 * hop is re-validated against the allowlist and private-address checks.
 */
export async function safeFetch(
  raw: string,
  allowedHosts: string[],
  opts: { maxBytes?: number; timeoutMs?: number; maxRedirects?: number } = {},
): Promise<{ url: string; contentType: string; body: string }> {
  const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024;
  let current = validateUrlShape(raw, allowedHosts);
  for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
    await assertPublicHost(current.hostname);
    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
      headers: { "user-agent": "LendermarketCopilotBot/1.0 (+knowledge-sync)", accept: "text/html,text/plain" },
      credentials: "omit",
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new UrlNotAllowedError("redirect without location");
      current = validateUrlShape(new URL(location, current).toString(), allowedHosts);
      continue;
    }
    if (!res.ok) throw new Error(`Fetch failed with HTTP ${res.status}`);
    const contentType = res.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain/i.test(contentType)) throw new UrlNotAllowedError(`unsupported content type ${contentType}`);
    const reader = res.body?.getReader();
    if (!reader) throw new Error("Empty response body");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new UrlNotAllowedError("page is too large");
      }
      chunks.push(value);
    }
    return { url: current.toString(), contentType, body: Buffer.concat(chunks).toString("utf8") };
  }
  throw new UrlNotAllowedError("too many redirects");
}
