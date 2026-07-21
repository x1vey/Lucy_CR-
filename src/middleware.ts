import { NextRequest, NextResponse } from "next/server";

// Cheap gate: if there's no session cookie, bounce protected routes to /login.
// This is a fast presence check only — the signature is verified (and the admin
// re-loaded from the DB) by requireAdmin() in the page/layout itself, so a
// forged cookie still can't get in. Public routes are excluded via the matcher.
const SESSION_COOKIE = "lucy_session";

export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has(SESSION_COOKIE);
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    // Remember where they were headed so we could return there later.
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// Protect the app screens. Everything NOT matched here (login, public form
// pages under /f, the ingest API, static assets) stays open.
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/contacts/:path*",
    "/products/:path*",
    "/tags/:path*",
    "/forms/:path*",
    "/admins/:path*",
    "/utm/:path*",
  ],
};
