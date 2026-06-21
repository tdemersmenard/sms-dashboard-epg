export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getFranchiseByPhoneNumber, GRANBY_FRANCHISE_ID } from "@/lib/franchise";

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const from      = formData.get("From") as string;
    const to        = formData.get("To")   as string;   // numéro Twilio de la franchise
    const body      = formData.get("Body") as string;
    const messageSid = formData.get("MessageSid") as string;
    const numMedia  = parseInt(formData.get("NumMedia") as string || "0", 10);
    const mediaUrls: string[] = [];
    for (let i = 0; i < numMedia; i++) {
      const url         = formData.get(`MediaUrl${i}`)         as string;
      const contentType = formData.get(`MediaContentType${i}`) as string;
      if (url && contentType?.startsWith("image/")) mediaUrls.push(url);
    }

    if (!from || (!body && numMedia === 0)) {
      return new NextResponse(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
    }

    // ─── ROUTING MULTI-FRANCHISE ─────────────────────────────────────────────
    // Identifier la franchise à partir du numéro de destination (To)
    const franchiseId = to ? await getFranchiseByPhoneNumber(to) : GRANBY_FRANCHISE_ID;

    // ─── FIND OR CREATE CONTACT ───────────────────────────────────────────────
    // Important: chercher par (phone + franchise_id) après la migration phase 1
    let { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("phone", from)
      .eq("franchise_id", franchiseId)
      .maybeSingle();

    if (!contact) {
      const { data: newContact, error: createError } = await supabaseAdmin
        .from("contacts")
        .insert({ phone: from, franchise_id: franchiseId })
        .select("id")
        .single();

      if (createError) throw createError;
      contact = newContact;
    }

    // ─── SAVE INBOUND MESSAGE ─────────────────────────────────────────────────
    const { error: msgError } = await supabaseAdmin.from("messages").insert({
      contact_id:  contact!.id,
      twilio_sid:  messageSid,
      direction:   "inbound",
      body:        body || "[Photo reçue]",
      status:      "received",
      is_read:     false,
      franchise_id: franchiseId,
    });

    if (msgError) throw msgError;

    // ─── PHOTOS ───────────────────────────────────────────────────────────────
    if (mediaUrls.length > 0) {
      // Récupérer les credentials Twilio de la franchise pour télécharger les médias
      const { getFranchiseContext } = await import("@/lib/franchise");
      const ctx = await getFranchiseContext(franchiseId);
      const twilioSid   = ctx?.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID || "";
      const twilioToken = ctx?.twilioAuthToken  || process.env.TWILIO_AUTH_TOKEN  || "";

      for (const mediaUrl of mediaUrls) {
        try {
          const imgResp = await fetch(mediaUrl, {
            headers: {
              Authorization: "Basic " + Buffer.from(`${twilioSid}:${twilioToken}`).toString("base64"),
            },
          });
          const imgBuffer = await imgResp.arrayBuffer();
          const ext       = imgResp.headers.get("content-type")?.includes("png") ? "png" : "jpg";
          const fileName  = `photos/${contact!.id}/${Date.now()}.${ext}`;

          await supabaseAdmin.storage
            .from("documents")
            .upload(fileName, Buffer.from(imgBuffer), {
              contentType: imgResp.headers.get("content-type") || "image/jpeg",
            });

          const { data: urlData } = supabaseAdmin.storage.from("documents").getPublicUrl(fileName);

          await supabaseAdmin.from("documents").insert({
            contact_id:  contact!.id,
            type:        "photo_client",
            pdf_url:     urlData.publicUrl,
            notes:       `Photo reçue par SMS le ${new Date().toLocaleDateString("fr-CA")}`,
            franchise_id: franchiseId,
          });
        } catch (photoErr) {
          console.error("[webhook] Error saving photo:", photoErr);
        }
      }
    }

    // ─── AI AGENT ─────────────────────────────────────────────────────────────
    if (process.env.AI_AGENT_ENABLED === "true") {
      try {
        const { generateAIResponse } = await import("@/lib/ai-agent");
        const aiReply = await generateAIResponse(
          contact!.id,
          body,
          mediaUrls.length > 0 ? mediaUrls : undefined,
          franchiseId
        );

        if (aiReply) {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${request.headers.get("host")}`;
          await fetch(`${baseUrl}/api/sms/send`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({
              contactId:   contact!.id,
              body:        aiReply,
              franchiseId,  // passer le contexte franchise explicitement
            }),
          });
        }
      } catch (aiErr) {
        console.error("[webhook] AI agent error:", aiErr);
      }
    }

    return new NextResponse(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
  } catch (err) {
    console.error("Webhook error:", err);
    return new NextResponse(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" }, status: 200 });
  }
}
