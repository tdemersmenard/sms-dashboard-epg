import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/portail",
  "/employe",
  "/api",
  "/_next",
  "/favicon.ico",
];

// Old CRM routes that should redirect to /granby/... (backward compatibility)
const OLD_CRM_ROUTES = [
  "/dashboard",
  "/messages",
  "/clients",
  "/routes",
  "/calendar",
  "/pipeline",
  "/analytics",
  "/depenses",
  "/odometre",
  "/employes",
  "/catalogue",
  "/reglages-bot",
  "/diagnostic",
  "/learnings",
  "/a-rappeler",
  "/factures",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public paths — let them through
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check session for all protected routes
  const session = req.cookies.get("chlore_session");
  if (!session?.value) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect old CRM routes to /granby/... (backward compatibility)
  for (const old of OLD_CRM_ROUTES) {
    if (pathname === old || pathname.startsWith(old + "/")) {
      const newPath = `/granby${pathname}`;
      return NextResponse.redirect(new URL(newPath, req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|icon-.*\\.png).*)"],
};
