import { NextRequest, NextResponse } from "next/server";

/**
 * Optional site-wide password gate (HTTP Basic Auth).
 *
 * - Disabled unless SITE_PASSWORD is set, so local dev stays frictionless.
 * - When SITE_PASSWORD is set, the browser shows a native username/password
 *   prompt. Username defaults to "manager" (override with SITE_USERNAME).
 * - Set SITE_PASSWORD (and optionally SITE_USERNAME) in Vercel → Settings →
 *   Environment Variables to lock the deployed site down to your team.
 */
export function middleware(req: NextRequest) {
  const expectedPassword = process.env.SITE_PASSWORD;
  if (!expectedPassword) return NextResponse.next();

  const expectedUser = process.env.SITE_USERNAME || "manager";
  const header = req.headers.get("authorization");

  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const sep = decoded.indexOf(":");
      const user = decoded.slice(0, sep);
      const pass = decoded.slice(sep + 1);
      if (user === expectedUser && pass === expectedPassword) {
        return NextResponse.next();
      }
    } catch {
      /* fall through to 401 */
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Community AI", charset="UTF-8"',
    },
  });
}

export const config = {
  // Gate everything except Next's static assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
