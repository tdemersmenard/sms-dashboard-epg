import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    // Get all contacts with their latest message
    const { data: contacts, error: contactsError } = await supabaseAdmin
      .from("contacts")
      .select("*");

    if (contactsError) throw contactsError;
    if (!contacts || contacts.length === 0) {
      return NextResponse.json([]);
    }

    const conversations = [];

    for (const contact of contacts) {
      // Get latest message for this contact
      const { data: lastMsg } = await supabaseAdmin
        .from("messages")
        .select("*")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!lastMsg) continue;

      // Count unread inbound messages
      const { count } = await supabaseAdmin
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("contact_id", contact.id)
        .eq("direction", "inbound")
        .eq("is_read", false);

      conversations.push({
        contact_id: contact.id,
        phone: contact.phone,
        name: contact.name,
        notes: contact.notes,
        last_message: lastMsg.body,
        last_direction: lastMsg.direction,
        last_message_at: lastMsg.created_at,
        unread_count: count || 0,
      });
    }

    // Sort by latest message
    conversations.sort(
      (a, b) =>
        new Date(b.last_message_at).getTime() -
        new Date(a.last_message_at).getTime()
    );

    return NextResponse.json(conversations);
  } catch (err: any) {
    console.error("Error fetching conversations:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch conversations" },
      { status: 500 }
    );
  }
}