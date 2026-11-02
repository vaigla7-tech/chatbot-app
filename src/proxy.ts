import { NextResponse, type NextRequest } from "next/server";

/**
 * Security headers for pages, plus a lightweight redirect for unauthenticated
 * admin page requests (real authorization happens server-side in every admin
 * layout and route handler). API routes are excluded from the matcher so large
 * uploads are not buffered here.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/admin") &&
    !pathname.startsWith("/admin/login") &&
    !pathname.startsWith("/admin/setup") &&
    !req.cookies.has("lm_admin_session")
  ) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  const isWidget = pathname.startsWith("/widget");
  const widgetOrigins = (process.env.WIDGET_ALLOWED_ORIGINS ?? "").split(/[\s,]+/).filter((o) => /^https:\/\/[^\s/]+$/.test(o));
  const frameAncestors = isWidget && widgetOrigins.length ? `'self' ${widgetOrigins.join(" ")}` : "'self'";
  const dev = process.env.NODE_ENV !== "production";

  res.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      // Next.js hydration needs inline scripts; no third-party script sources are allowed.
      `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      `frame-ancestors ${frameAncestors}`,
    ].join("; "),
  );
  if (!isWidget) res.headers.set("X-Frame-Options", "SAMEORIGIN");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (!dev) res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  if (pathname.startsWith("/admin")) res.headers.set("Cache-Control", "no-store");
  return res;
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|brand/|embed.js|favicon.ico).*)"],
};
