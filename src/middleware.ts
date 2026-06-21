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

// Pages restricted to master (super-admin) only — franchise owners cannot access these
const MASTER_ONLY_SUFFIXES = [
  "/reglages-bot",
  "/diagnostic",
  "/depenses",
  "/odometre",
  "/learnings",
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

  // Role-based route protection
  const role = req.cookies.get("chlore_role")?.value;
  const isMaster = role === "master";

  // Block /master for non-master users
  if (!isMaster && (pathname === "/master" || pathname.startsWith("/master/"))) {
    // Extract slug from cookie or redirect to login
    const redirectUrl = new URL("/login", req.url);
    return NextResponse.redirect(redirectUrl);
  }

  // Block masterOnly CRM pages for franchise owners (e.g., /trois-rivieres/depenses)
  if (!isMaster) {
    // pathname format: /slug/page — extract the page part
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length >= 2) {
      const pagePath = "/" + segments.slice(1).join("/");
      for (const suffix of MASTER_ONLY_SUFFIXES) {
        if (pagePath === suffix || pagePath.startsWith(suffix + "/")) {
          // Redirect to franchise dashboard
          const slug = segments[0];
          return NextResponse.redirect(new URL(`/${slug}`, req.url));
        }
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|icon-.*\\.png).*)"],
};
