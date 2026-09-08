export const dynamic = "force-dynamic";
// Débounce (8s) + génération IA (jusqu'à ~20s sur Opus): il faut plus que les 15s par défaut.
// La réponse SMS part par l'API REST, pas par le TwiML — Twilio peut timer out sans conséquence.
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getFranchiseByPhoneNumber, GRANBY_FRANCHISE_ID } from "@/lib/franchise";
import { normalizePhone, isReactionMessage } from "@/lib/utils";

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

// Fenêtre de regroupement: si le client envoie plusieurs SMS coup sur coup,
// seule l'invocation qui détient le DERNIER message répond (avec tout le contexte).
const DEBOUNCE_MS = 8000;


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
    const normalizedFrom = normalizePhone(from);

    // 1. Chercher par (phone normalisé + franchise_id)
    let { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("phone", normalizedFrom)
      .eq("franchise_id", franchiseId)
      .maybeSingle();

    // 2. Fallback: chercher un orphan (même phone, franchise_id NULL) et le rattacher
    if (!contact) {
      const { data: orphan } = await supabaseAdmin
        .from("contacts")
        .select("id")
        .eq("phone", normalizedFrom)
        .is("franchise_id", null)
        .maybeSingle();

      if (orphan) {
        await supabaseAdmin
          .from("contacts")
          .update({ franchise_id: franchiseId })
          .eq("id", orphan.id);
        contact = orphan;
      }
    }

    // 3. Créer un nouveau contact si aucun trouvé
    if (!contact) {
      const { data: newContact, error: createError } = await supabaseAdmin
        .from("contacts")
        .insert({ phone: normalizedFrom, franchise_id: franchiseId })
        .select("id")
        .single();

      if (createError) throw createError;
      contact = newContact;
    }

    // ─── SAVE INBOUND MESSAGE ─────────────────────────────────────────────────
    const { data: savedMsg, error: msgError } = await supabaseAdmin.from("messages").insert({
      contact_id:  contact!.id,
      twilio_sid:  messageSid,
      direction:   "inbound",
      body:        body || "[Photo reçue]",
      status:      "received",
      is_read:     false,
      franchise_id: franchiseId,
    }).select("id").single();

    if (msgError) {
      // Doublon twilio_sid (retry Twilio) → déjà traité, ne surtout pas re-répondre
      if (msgError.code === "23505") {
        console.log("[webhook] duplicate MessageSid, skipping:", messageSid);
        return new NextResponse(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
      }
      throw msgError;
    }

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
    // 1. Réaction iMessage ("Adore", "Liked", …) → historique seulement, jamais de réponse.
    if (isReactionMessage(body)) {
      console.log("[webhook] réaction détectée, pas de réponse IA");
      return new NextResponse(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
    }

    if (process.env.AI_AGENT_ENABLED === "true") {
      try {
        // 2. Débounce anti-double-réponse: si le client envoie plusieurs messages coup
        // sur coup, on attend, puis seule l'invocation détenant le DERNIER vrai message
        // (hors réactions) génère UNE réponse — avec tous les messages en contexte.
        await new Promise((r) => setTimeout(r, DEBOUNCE_MS));

        const { data: latestMsgs } = await supabaseAdmin
          .from("messages")
          .select("id, body")
          .eq("contact_id", contact!.id)
          .eq("direction", "inbound")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(5);

        const latestReal = (latestMsgs || []).find((m) => !isReactionMessage(m.body));
        if (latestReal && latestReal.id !== savedMsg!.id) {
          console.log("[webhook] message plus récent détecté, cette invocation laisse la main");
          return new NextResponse(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
        }

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
