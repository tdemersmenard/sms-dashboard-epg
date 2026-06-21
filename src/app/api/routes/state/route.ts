export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveFranchiseId } from "@/lib/franchise-context";

export async function GET() {
  try {
    const franchiseId = await getActiveFranchiseId();

    const { data } = await supabaseAdmin
      .from("route_state")
      .select("data, updated_at")
      .eq("franchise_id", franchiseId)
      .maybeSingle();

    if (!data) return NextResponse.json({ exists: false });

    // Aussi récupérer les IDs déjà confirmés pour cette franchise
    const { data: confirmedLogs } = await supabaseAdmin
      .from("automation_logs")
      .select("action")
      .eq("franchise_id", franchiseId)
      .like("action", "route_confirmed_%");

    const confirmedIds = (confirmedLogs || []).map((l: { action: string }) => l.action.replace("route_confirmed_", ""));

    return NextResponse.json({ exists: true, ...data.data, confirmedIds, updatedAt: data.updated_at });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
