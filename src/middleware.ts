import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/portail",
  "/api/portail",
  "/api/auth",
  "/api/webhook",
  "/api/sms",
  "/api/twilio",
  "/api/cron",
  "/api/leads",
  "/api/email/check-payments",
  "/_next",
  "/favicon.ico",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // API portail = toujours public
  if (pathname.startsWith("/api/portail")) {
    return NextResponse.next();
  }

  // Portail client : protéger les sous-pages
  if (pathname.startsWith("/portail")) {
    // Page de login portail = publique
    if (pathname === "/portail" || pathname.startsWith("/portail/login")) {
      return NextResponse.next();
    }
    // Sous-pages = vérifier le cookie
    const token = req.cookies.get("portal_token")?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/portail", req.url));
    }
    // Cookie existe = OK, laisser passer et STOP (ne pas checker admin)
    return NextResponse.next();
  }

  // App admin : laisser passer les chemins publics
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // App admin : vérifier le cookie de session
  const session = req.cookies.get("chlore_session");
  if (!session?.value) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
