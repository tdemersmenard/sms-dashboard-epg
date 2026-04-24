import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const redirect = req.nextUrl.searchParams.get("redirect") || "/portail/dashboard";

  if (!token) {
    return NextResponse.redirect(new URL("/portail", req.url));
  }

  const response = NextResponse.redirect(new URL(redirect, req.url));
  response.cookies.set("portal_token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  return response;
}
