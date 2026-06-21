export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveFranchiseId } from "@/lib/franchise-context";

export async function GET() {
  try {
    const franchiseId = await getActiveFranchiseId();

    const { data, error } = await supabaseAdmin
      .from("employees")
      .select("id, name, zone")
      .eq("franchise_id", franchiseId)
      .eq("active", true)
      .order("name");

    if (error) {
      if (error.code === "42P01") return NextResponse.json({ employees: [] });
      throw error;
    }

    return NextResponse.json({ employees: data || [] });
  } catch (e) {
    return NextResponse.json({ employees: [], error: String(e) });
  }
}
