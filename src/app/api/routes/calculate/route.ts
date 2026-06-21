export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { calculateRoutes } from "@/lib/routes/calculator";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveFranchiseId } from "@/lib/franchise-context";

export async function POST() {
  try {
    const franchiseId = await getActiveFranchiseId();
    const result = await calculateRoutes(franchiseId);

    // Sauvegarder dans la DB
    await supabaseAdmin.from("route_state").upsert({
      franchise_id: franchiseId,
      data: result,
      updated_at: new Date().toISOString(),
    }, { onConflict: "franchise_id" });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
