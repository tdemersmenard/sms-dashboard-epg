export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateAIResponse } from "@/lib/ai-agent";

/**
 * Simulateur de conversation bot — POUR TESTS UNIQUEMENT.
 *
 * POST { phone, message, franchiseId, firstName?, lastName?, services?, stage? }
 *
 * Reproduit le chemin du webhook Twilio (find-or-create contact, insert inbound,
 * generateAIResponse, persist outbound) SANS envoyer de SMS via Twilio.
 * Les actions (BOOK_JOB, CLOSE_DEAL...) s'exécutent réellement en DB.
 *
 * Auth OBLIGATOIRE: Authorization: Bearer <CRON_SECRET>. Refuse si CRON_SECRET absent.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { phone, message, franchiseId, firstName, lastName, services, stage } = await req.json();
    if (!phone || !message || !franchiseId) {
      return NextResponse.json({ error: "phone, message, franchiseId required" }, { status: 400 });
    }

    // Find-or-create contact (même logique que le webhook)
    let { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("phone", phone)
      .eq("franchise_id", franchiseId)
      .maybeSingle();

    if (!contact) {
      const { data: created, error } = await supabaseAdmin
        .from("contacts")
        .insert({
          phone,
          franchise_id: franchiseId,
          first_name: firstName ?? "Test",
          last_name: lastName ?? "BotSim",
          stage: stage ?? "nouveau",
          ...(services ? { services } : {}),
        })
        .select("id")
        .single();
      if (error || !created) throw new Error(`contact create failed: ${error?.message}`);
      contact = created;
    }

    await supabaseAdmin.from("messages").insert({
      contact_id: contact.id,
      direction: "inbound",
      body: message,
      status: "received",
      is_read: true,
      franchise_id: franchiseId,
    });

    const reply = await generateAIResponse(contact.id, message, undefined, franchiseId);

    if (reply) {
      await supabaseAdmin.from("messages").insert({
        contact_id: contact.id,
        direction: "outbound",
        body: reply,
        status: "simulated",
        is_read: true,
        franchise_id: franchiseId,
      });
    }

    return NextResponse.json({ contactId: contact.id, reply });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "bot-sim error";
    console.error("[bot-sim] error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
