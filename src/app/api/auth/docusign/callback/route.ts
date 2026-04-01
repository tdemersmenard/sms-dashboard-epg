import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "No code" }, { status: 400 });
  }

  try {
    const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY!;
    const secretKey = process.env.DOCUSIGN_SECRET_KEY!;
    const redirectUri = process.env.DOCUSIGN_REDIRECT_URI!;

    const basicAuth = Buffer.from(`${integrationKey}:${secretKey}`).toString("base64");

    const tokenRes = await fetch("https://account-d.docusign.com/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(redirectUri)}`,
    });

    const tokens = await tokenRes.json();

    if (tokens.error) {
      console.error("[docusign-callback] Token error:", tokens);
      return NextResponse.redirect(new URL("/dashboard?docusign=error", req.url));
    }

    await supabaseAdmin
      .from("settings")
      .upsert({ key: "docusign_tokens", value: JSON.stringify(tokens) });

    return NextResponse.redirect(new URL("/dashboard?docusign=connected", req.url));
  } catch (err) {
    console.error("[docusign-callback] Error:", err);
    return NextResponse.redirect(new URL("/dashboard?docusign=error", req.url));
  }
}
