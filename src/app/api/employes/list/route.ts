export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("employees")
      .select("id, name, zone")
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
