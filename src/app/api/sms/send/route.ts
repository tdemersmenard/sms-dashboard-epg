export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getTwilioForFranchise, GRANBY_FRANCHISE_ID } from "@/lib/franchise";

/**
 * POST { contactId, body } | { to, body, franchiseId }
 *
 * Utilise les credentials Twilio de la franchise concernée.
 * Si franchiseId n'est pas fourni explicitement, le déduit du contact.
 * Fallback sur les env vars globaux (Granby / backward compat).
 */
export async function POST(req: NextRequest) {
  try {
    const { contactId, body, to, franchiseId: explicitFranchiseId } = await req.json();

    if (!body?.trim()) {
      return NextResponse.json({ error: "body is required" }, { status: 400 });
    }

    // ─── Résoudre le numéro de téléphone + franchise_id ─────────────────────
    let phone: string = to ?? "";
    let franchiseId: string = explicitFranchiseId ?? GRANBY_FRANCHISE_ID;

    if (contactId) {
      const { data: contact, error } = await supabaseAdmin
        .from("contacts")
        .select("phone, franchise_id")
        .eq("id", contactId)
        .single();

      if (error || !contact) {
        return NextResponse.json({ error: "Contact not found" }, { status: 404 });
      }

      if (!phone) phone = contact.phone;
      // La franchise du contact prime sur le paramètre explicite
      if (contact.franchise_id) franchiseId = contact.franchise_id;
    }

    if (!phone) {
      return NextResponse.json({ error: "to or contactId is required" }, { status: 400 });
    }

    // ─── Client Twilio de la franchise ───────────────────────────────────────
    const twilioCtx = await getTwilioForFranchise(franchiseId);

    if (!twilioCtx) {
      // Fallback: utiliser le client global (ne devrait pas arriver en prod)
      const { twilioClient, twilioPhoneNumber } = await import("@/lib/twilio");
      const twilioMsg = await twilioClient.messages.create({
        body: body.trim(),
        from: twilioPhoneNumber,
        to:   phone,
      });
      const { data: message, error: msgError } = await supabaseAdmin
        .from("messages")
        .insert({
          contact_id:   contactId ?? null,
          twilio_sid:   twilioMsg.sid,
          direction:    "outbound",
          body:         body.trim(),
          status:       twilioMsg.status,
          is_read:      true,
          franchise_id: franchiseId,
        })
        .select()
        .single();
      if (msgError) throw msgError;
      return NextResponse.json(message);
    }

    // ─── Envoi via Twilio de la franchise ────────────────────────────────────
    const twilioMsg = await twilioCtx.client.messages.create({
      body: body.trim(),
      from: twilioCtx.phoneNumber,
      to:   phone,
    });

    // ─── Persister le message ─────────────────────────────────────────────────
    const { data: message, error: msgError } = await supabaseAdmin
      .from("messages")
      .insert({
        contact_id:   contactId ?? null,
        twilio_sid:   twilioMsg.sid,
        direction:    "outbound",
        body:         body.trim(),
        status:       twilioMsg.status,
        is_read:      true,
        franchise_id: franchiseId,
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
