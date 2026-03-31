export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Twilio sends POST when a message comes in
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const from = formData.get("From") as string;
    const body = formData.get("Body") as string;
    const messageSid = formData.get("MessageSid") as string;

    if (!from || !body) {
      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { "Content-Type": "text/xml" } }
      );
    }

    // Find or create contact
    let { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("phone", from)
      .single();

    if (!contact) {
      const { data: newContact, error: createError } = await supabaseAdmin
        .from("contacts")
        .insert({ phone: from })
        .select("id")
        .single();

      if (createError) throw createError;
      contact = newContact;
    }

    // Save inbound message
    const { error: msgError } = await supabaseAdmin.from("messages").insert({
      contact_id: contact!.id,
      twilio_sid: messageSid,
      direction: "inbound",
      body,
      status: "received",
      is_read: false,
    });

    if (msgError) throw msgError;

    // AI Agent — auto-reply
    if (process.env.AI_AGENT_ENABLED === "true") {
      try {
        const { generateAIResponse } = await import("@/lib/ai-agent");

        const aiReply = await generateAIResponse(contact!.id, body);

        if (aiReply) {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${request.headers.get("host")}`;
          await fetch(`${baseUrl}/api/sms/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contactId: contact!.id,
              body: aiReply,
            }),
          });
        }
      } catch (aiErr) {
        console.error("[webhook] AI agent error:", aiErr);
        // Ne pas fail le webhook si l'AI crash
      }
    }

    // Return empty TwiML (no auto-reply via TwiML)
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { "Content-Type": "text/xml" } }
    );
  } catch (err: any) {
    console.error("Webhook error:", err);
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { "Content-Type": "text/xml" }, status: 200 }
    );
  }
}
