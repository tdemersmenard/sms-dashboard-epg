export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveFranchiseId } from "@/lib/franchise-context";

/** GET — Load notification phone for active franchise */
export async function GET() {
  try {
    const franchiseId = await getActiveFranchiseId();

    const { data, error } = await supabaseAdmin
      .from("franchises")
      .select("owner_phone")
      .eq("id", franchiseId)
      .single();

    if (error) throw error;

    return NextResponse.json({
      notificationPhone: data.owner_phone || "",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST — Save notification phone */
export async function POST(req: NextRequest) {
  try {
    const franchiseId = await getActiveFranchiseId();
    const { notificationPhone } = await req.json();

    const { error } = await supabaseAdmin
      .from("franchises")
      .update({ owner_phone: (notificationPhone || "").trim() })
      .eq("id", franchiseId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
