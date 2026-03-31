export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin.rpc("get_conversations_v2");

    if (error) throw error;

    return NextResponse.json(data ?? [], {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
        "CDN-Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch";
    console.error("[conversations]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
