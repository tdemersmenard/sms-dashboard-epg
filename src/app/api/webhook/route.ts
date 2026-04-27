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
    const numMedia = parseInt(formData.get("NumMedia") as string || "0", 10);
    const mediaUrls: string[] = [];
    for (let i = 0; i < numMedia; i++) {
      const url = formData.get(`MediaUrl${i}`) as string;
      const contentType = formData.get(`MediaContentType${i}`) as string;
      if (url && contentType?.startsWith("image/")) {
        mediaUrls.push(url);
      }
    }

    if (!from || (!body && numMedia === 0)) {
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
      body: body || `[Photo reçue]`,
      status: "received",
      is_read: false,
    });

    if (msgError) throw msgError;

    // Sauvegarder les photos reçues
    if (mediaUrls.length > 0) {
      for (const mediaUrl of mediaUrls) {
        try {
          // Télécharger l'image depuis Twilio
          const imgResp = await fetch(mediaUrl, {
            headers: {
              Authorization: "Basic " + Buffer.from(
                `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
              ).toString("base64"),
            },
          });
          const imgBuffer = await imgResp.arrayBuffer();
          const ext = imgResp.headers.get("content-type")?.includes("png") ? "png" : "jpg";
          const fileName = `photos/${contact!.id}/${Date.now()}.${ext}`;

          // Upload dans Supabase Storage
          await supabaseAdmin.storage
            .from("documents")
            .upload(fileName, Buffer.from(imgBuffer), {
              contentType: imgResp.headers.get("content-type") || "image/jpeg",
            });

          const { data: urlData } = supabaseAdmin.storage
            .from("documents")
            .getPublicUrl(fileName);

          // Sauvegarder la référence
          await supabaseAdmin.from("documents").insert({
            contact_id: contact!.id,
            type: "photo_client",
            pdf_url: urlData.publicUrl,
            notes: `Photo reçue par SMS le ${new Date().toLocaleDateString("fr-CA")}`,
          });

          console.log("[webhook] Photo saved:", fileName);
        } catch (photoErr) {
          console.error("[webhook] Error saving photo:", photoErr);
        }
      }
    }

    // AI Agent — auto-reply
    if (process.env.AI_AGENT_ENABLED === "true") {
      try {
        const { generateAIResponse } = await import("@/lib/ai-agent");

        const aiReply = await generateAIResponse(contact!.id, body, mediaUrls.length > 0 ? mediaUrls : undefined);

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
  } catch (err: unknown) {
    console.error("Webhook error:", err);
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { "Content-Type": "text/xml" }, status: 200 }
    );
  }
}
