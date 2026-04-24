import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const redirect = req.nextUrl.searchParams.get("redirect") || "/portail/dashboard";

  if (!token) {
    return NextResponse.redirect(new URL("/portail", req.url));
  }

  // Utiliser une page HTML qui set le cookie via meta refresh
  // Ça garantit que le cookie est appliqué AVANT la navigation
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta http-equiv="refresh" content="0;url=${redirect}">
      </head>
      <body>Redirection...</body>
    </html>
  `;

  const response = new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });

  response.cookies.set("portal_token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  return response;
}
