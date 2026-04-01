export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    const { data } = await supabaseAdmin
      .from("settings")
      .select("value")
      .eq("key", "docusign_tokens")
      .maybeSingle();

    return NextResponse.json({ connected: !!data?.value });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
