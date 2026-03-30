import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("conversations")
      .select("*")
      .order("last_message_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (err: any) {
    console.error("Error fetching conversations:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch conversations" },
      { status: 500 }
    );
  }
}
