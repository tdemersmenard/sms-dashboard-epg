import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { twilioClient, twilioPhoneNumber } from "@/lib/twilio";

// POST /api/sync - Pull Twilio messages and sync to Supabase
// Body: { since?: ISO string } — if provided, only fetches messages after that date (faster)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const since: Date | undefined = body.since ? new Date(body.since) : undefined;

    let synced = 0;
    let skipped = 0;
    let contactsCreated = 0;

    const twilioMessages = await twilioClient.messages.list({
      limit: since ? 100 : 1000,
      ...(since ? { dateSentAfter: since } : {}),
    });

    for (const msg of twilioMessages) {
      const isOutbound = msg.from === twilioPhoneNumber;
      const isInbound = msg.to === twilioPhoneNumber;

      if (!isOutbound && !isInbound) continue;

      const direction = isOutbound ? "outbound" : "inbound";
      const otherPhone = isOutbound ? msg.to : msg.from;

      // Skip if already in DB
      const { data: existing } = await supabaseAdmin
        .from("messages")
        .select("id")
        .eq("twilio_sid", msg.sid)
        .single();

      if (existing) {
        skipped++;
        continue;
      }

      // Find or create contact
      let { data: contact } = await supabaseAdmin
        .from("contacts")
        .select("id")
        .eq("phone", otherPhone)
        .single();

      if (!contact) {
        const { data: newContact, error: createError } = await supabaseAdmin
          .from("contacts")
          .insert({ phone: otherPhone })
          .select("id")
          .single();

        if (createError) {
          console.error(`Error creating contact for ${otherPhone}:`, createError);
          continue;
        }
        contact = newContact;
        contactsCreated++;
      }

      const { error: msgError } = await supabaseAdmin.from("messages").insert({
        contact_id: contact!.id,
        twilio_sid: msg.sid,
        direction,
        body: msg.body || "",
        status: msg.status,
        is_read: direction === "outbound",
        created_at: msg.dateCreated.toISOString(),
      });

      if (msgError) {
        console.error(`Error inserting message ${msg.sid}:`, msgError);
        continue;
      }

      synced++;
    }

    return NextResponse.json({ success: true, synced, skipped, contacts_created: contactsCreated });
  } catch (err: any) {
    console.error("Sync error:", err);
    return NextResponse.json({ error: err.message || "Sync failed" }, { status: 500 });
  }
}
