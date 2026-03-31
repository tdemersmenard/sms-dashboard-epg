export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getOAuth2Client } from "@/lib/google";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "No code provided" }, { status: 400 });
  }

  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    // Store tokens in Supabase
    await supabaseAdmin
      .from("settings")
      .upsert({ key: "google_tokens", value: JSON.stringify(tokens) });

    return NextResponse.redirect(new URL("/dashboard?gmail=connected", req.url));
  } catch (err) {
    console.error("[google-callback] Error:", err);
    return NextResponse.redirect(new URL("/dashboard?gmail=error", req.url));
  }
}
