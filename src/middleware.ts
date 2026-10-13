import { NextResponse, type NextRequest } from "next/server";

/**
 * Coarse gate only: no session cookie → /login (401 for /api). Edge runtime cannot hit the DB, so this is NOT
 * the security boundary — every page, action and route handler still validates the session and permissions
 * server-side (requireUser / requirePermission).
 */
const COOKIE = process.env.NODE_ENV === "production" ? "__Host-kcmsc_session" : "kcmsc_session";
const PUBLIC_PATHS = ["/login"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.includes(pathname) || req.cookies.has(COOKIE)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
