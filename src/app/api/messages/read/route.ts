export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const { contactId } = await request.json();

    if (!contactId) {
      return NextResponse.json({ error: "contactId is required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("messages")
      .update({ is_read: true })
      .eq("contact_id", contactId)
      .eq("direction", "inbound")
      .eq("is_read", false);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error marking messages as read:", err);
    return NextResponse.json(
      { error: err.message || "Failed to mark messages as read" },
      { status: 500 }
    );
  }
}
