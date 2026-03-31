export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { twilioClient, twilioPhoneNumber } from "@/lib/twilio";
import { supabaseAdmin } from "@/lib/supabase";

// POST { contactId, body } — or { to, body, contactId } for direct send
export async function POST(req: NextRequest) {
  try {
    const { contactId, body, to } = await req.json();

    if (!body?.trim()) {
      return NextResponse.json({ error: "body is required" }, { status: 400 });
    }

    // Resolve phone number
    let phone: string = to ?? "";
    if (!phone && contactId) {
      const { data: contact, error } = await supabaseAdmin
        .from("contacts")
        .select("phone")
        .eq("id", contactId)
        .single();
      if (error || !contact) {
        return NextResponse.json(
          { error: "Contact not found" },
          { status: 404 }
        );
      }
      phone = contact.phone;
    }

    if (!phone) {
      return NextResponse.json(
        { error: "to or contactId is required" },
        { status: 400 }
      );
    }

    // Send via Twilio
    const twilioMsg = await twilioClient.messages.create({
      body: body.trim(),
      from: twilioPhoneNumber,
      to: phone,
    });

    // Persist to Supabase
    const { data: message, error: msgError } = await supabaseAdmin
      .from("messages")
      .insert({
        contact_id: contactId ?? null,
        twilio_sid: twilioMsg.sid,
        direction: "outbound",
        body: body.trim(),
        status: twilioMsg.status,
        is_read: true,
      })
      .select()
      .single();

    if (msgError) throw msgError;

    return NextResponse.json(message);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to send message";
    console.error("sms/send error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
