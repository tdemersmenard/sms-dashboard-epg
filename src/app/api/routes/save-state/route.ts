export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveFranchiseId } from "@/lib/franchise-context";

export async function POST(req: NextRequest) {
  try {
    const franchiseId = await getActiveFranchiseId();
    const data = await req.json();

    await supabaseAdmin.from("route_state").upsert(
      { franchise_id: franchiseId, data, updated_at: new Date().toISOString() },
      { onConflict: "franchise_id" }
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
