export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    const { data: contacts, error: contactsError } = await supabaseAdmin
      .from("contacts")
      .select("id, phone, name, notes");

    if (contactsError) throw contactsError;
    if (!contacts || contacts.length === 0) return NextResponse.json([]);

    // Run all queries in parallel — prevents stale data from sequential N+1 queries
    const results = await Promise.all(
      contacts.map(async (contact) => {
        const [lastMsgResult, unreadResult] = await Promise.all([
          supabaseAdmin
            .from("messages")
            .select("body, direction, created_at")
            .eq("contact_id", contact.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single(),
          supabaseAdmin
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("contact_id", contact.id)
            .eq("direction", "inbound")
            .eq("is_read", false),
        ]);

        if (!lastMsgResult.data) return null;

        return {
          contact_id: contact.id,
          phone: contact.phone,
          name: contact.name,
          notes: contact.notes,
          last_message: lastMsgResult.data.body,
          last_direction: lastMsgResult.data.direction,
          last_message_at: lastMsgResult.data.created_at,
          unread_count: unreadResult.count ?? 0,
        };
      })
    );

    const conversations = results
      .filter(Boolean)
      .sort(
        (a, b) =>
          new Date(b!.last_message_at).getTime() -
          new Date(a!.last_message_at).getTime()
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
