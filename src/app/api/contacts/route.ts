export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveFranchiseId } from "@/lib/franchise-context";

export async function GET() {
  try {
    const franchiseId = await getActiveFranchiseId();
    const { data, error } = await supabaseAdmin
      .from("contacts")
      .select("id, first_name, last_name, phone, email, address, city")
      .eq("franchise_id", franchiseId)
      .order("first_name", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ contacts: data || [] });
  } catch (err) {
    return NextResponse.json({ error: String(err), contacts: [] }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { contactId, name, notes, address } = await request.json();

    if (!contactId) {
      return NextResponse.json(
        { error: "contactId is required" },
        { status: 400 }
      );
    }

    const updates: Record<string, string> = {};
    if (name !== undefined) updates.name = name;
    if (notes !== undefined) updates.notes = notes;
    if (address !== undefined) updates.address = address;

    const franchiseId = await getActiveFranchiseId();
    const { data, error } = await supabaseAdmin
      .from("contacts")
      .update(updates)
      .eq("id", contactId)
      .eq("franchise_id", franchiseId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (err: any) {
    console.error("Error updating contact:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update contact" },
      { status: 500 }
    );
  }
}
