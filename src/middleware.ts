import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect all portail routes except the login page itself
  if (
    pathname.startsWith("/portail") &&
    pathname !== "/portail" &&
    !pathname.startsWith("/portail/login") &&
    !pathname.startsWith("/api/portail/")
  ) {
    const token = request.cookies.get("portal_token")?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/portail", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/portail/:path*"],
};
