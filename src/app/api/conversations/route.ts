export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const NO_CACHE = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

export async function GET() {
  try {
    const { data: contacts, error: contactsError } = await supabaseAdmin
      .from("contacts")
      .select("id, phone, name, notes");

    if (contactsError) throw contactsError;
    if (!contacts || contacts.length === 0)
      return NextResponse.json([], { headers: NO_CACHE });

    const results = await Promise.all(
      contacts.map(async (contact) => {
        const [lastMsgResult, unreadResult] = await Promise.all([
          // Use array + [0] instead of .single() — more reliable with PostgREST
          supabaseAdmin
            .from("messages")
            .select("body, direction, created_at")
            .eq("contact_id", contact.id)
            .order("created_at", { ascending: false })
            .limit(1),
          supabaseAdmin
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("contact_id", contact.id)
            .eq("direction", "inbound")
            .eq("is_read", false),
        ]);

        const lastMsg = lastMsgResult.data?.[0];
        if (!lastMsg) return null;

        return {
          contact_id: contact.id,
          phone: contact.phone,
          name: contact.name,
          notes: contact.notes,
          last_message: lastMsg.body,
          last_direction: lastMsg.direction,
          last_message_at: lastMsg.created_at,
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

    return NextResponse.json(conversations, { headers: NO_CACHE });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch";
    console.error("[conversations]", err);
    return NextResponse.json({ error: msg }, { status: 500, headers: NO_CACHE });
  }
}
