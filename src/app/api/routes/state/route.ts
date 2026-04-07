export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    const { data } = await supabaseAdmin
      .from("route_state")
      .select("data, updated_at")
      .eq("id", 1)
      .single();

    if (!data) return NextResponse.json({ exists: false });

    // Aussi récupérer les IDs déjà confirmés
    const { data: confirmedLogs } = await supabaseAdmin
      .from("automation_logs")
      .select("action")
      .like("action", "route_confirmed_%");

    const confirmedIds = (confirmedLogs || []).map((l: { action: string }) => l.action.replace("route_confirmed_", ""));

    return NextResponse.json({ exists: true, ...data.data, confirmedIds, updatedAt: data.updated_at });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
