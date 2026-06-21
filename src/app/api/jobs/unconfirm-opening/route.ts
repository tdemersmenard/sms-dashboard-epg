export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveFranchiseId } from "@/lib/franchise-context";

export async function POST(req: NextRequest) {
  try {
    const franchiseId = await getActiveFranchiseId();
    const { jobId } = await req.json();
    if (!jobId) return NextResponse.json({ error: "jobId requis" }, { status: 400 });

    await supabaseAdmin
      .from("jobs")
      .update({ confirmed_at: null })
      .eq("id", jobId)
      .eq("franchise_id", franchiseId);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
