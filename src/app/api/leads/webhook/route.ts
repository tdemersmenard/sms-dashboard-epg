export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { normalizePhone } from "@/lib/utils";
import { GRANBY_FRANCHISE_ID } from "@/lib/franchise";

// GET — Facebook verification handshake
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token === process.env.FACEBOOK_VERIFY_TOKEN &&
    challenge
  ) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * Returns true if the franchise can send SMS (has its own Twilio, or is Granby using env vars).
 * Prevents accidentally sending the first message from Granby's number for another franchise.
 */
async function franchiseCanSendSMS(franchiseId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("franchises")
    .select("twilio_phone_number, twilio_account_sid")
    .eq("id", franchiseId)
    .maybeSingle();

  if (data?.twilio_phone_number && data?.twilio_account_sid) return true;

  // Granby fallback: uses global env vars
  if (franchiseId === GRANBY_FRANCHISE_ID) {
    return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_PHONE_NUMBER);
  }

  return false;
}

/**
 * Resolve franchise_id from the request body.
 * Supports: franchise_id (UUID), franchise_slug (lookup).
 * Defaults to Granby.
 */
async function resolveFranchiseId(body: Record<string, unknown>): Promise<string> {
  // Direct UUID
  if (body.franchise_id && typeof body.franchise_id === "string") {
    return body.franchise_id;
  }

  // Slug lookup
  if (body.franchise_slug && typeof body.franchise_slug === "string") {
    const { data } = await supabaseAdmin
      .from("franchises")
      .select("id")
      .eq("slug", body.franchise_slug)
      .eq("status", "active")
      .maybeSingle();
    if (data?.id) return data.id;
  }

  return GRANBY_FRANCHISE_ID;
}

// POST — Receive Facebook Lead Ads events
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ── Detect format: Make.com (has phone) vs Facebook native (has entry) ──
    const entries = body?.entry ?? [];
    const isMakeFormat = !!(body.phone || body.name || body.first_name);

    if (isMakeFormat) {
      // ── MAKE.COM FORMAT ──
      let firstName = body.first_name || null;
      let lastName = body.last_name || null;
      const rawPhone = body.phone || null;
      const email = body.email || null;

      if (!firstName && body.name) {
        const parts = body.name.trim().split(" ");
        firstName = parts[0] || null;
        lastName = parts.slice(1).join(" ") || null;
      }

      if (!rawPhone) {
        return NextResponse.json({ error: "phone is required" }, { status: 400 });
      }

      const phone = normalizePhone(rawPhone);
      const franchiseId = await resolveFranchiseId(body);

      // ── Find existing contact (same phone + same franchise) ──
      let { data: existing } = await supabaseAdmin
        .from("contacts")
        .select("id, phone, first_name, last_name, franchise_id")
        .eq("phone", phone)
        .eq("franchise_id", franchiseId)
        .maybeSingle();

      // ── Fallback: claim orphan contact (same phone, NULL franchise_id) ──
      if (!existing) {
        const { data: orphan } = await supabaseAdmin
          .from("contacts")
          .select("id, phone, first_name, last_name, franchise_id")
          .eq("phone", phone)
          .is("franchise_id", null)
          .maybeSingle();

        if (orphan) {
          // Claim orphan: set franchise_id
          await supabaseAdmin
            .from("contacts")
            .update({ franchise_id: franchiseId })
            .eq("id", orphan.id);
          existing = { ...orphan, franchise_id: franchiseId };
        }
      }

      let contact;

      if (existing) {
        // Update name/email if we have better data
        const updates: Record<string, string> = {};
        if (firstName && !existing.first_name) updates.first_name = firstName;
        if (lastName && !existing.last_name) updates.last_name = lastName;
        if (email) updates.email = email;
        // Always update name if provided (lead form has the real name)
        if (firstName) updates.first_name = firstName;
        if (lastName) updates.last_name = lastName;

        const { data } = await supabaseAdmin
          .from("contacts")
          .update(updates)
          .eq("id", existing.id)
          .select()
          .single();
        contact = data;

        await supabaseAdmin.from("automation_logs").insert({
          contact_id: existing.id,
          franchise_id: franchiseId,
          type: "info",
          action: "facebook_resubmit",
          message: `Lead Facebook re-soumis par ${firstName ?? existing.phone}`,
          ran_at: new Date().toISOString(),
          status: "success",
        });
      } else {
        const { data } = await supabaseAdmin
          .from("contacts")
          .insert({
            first_name: firstName,
            last_name: lastName,
            phone,
            email,
            stage: "nouveau",
            lead_source: "facebook",
            franchise_id: franchiseId,
          })
          .select()
          .single();
        contact = data;
      }

      // Send SMS only for NEW contacts
      if (!existing && contact && contact.phone) {
        try {
          const canSend = await franchiseCanSendSMS(franchiseId);
          if (!canSend) {
            console.warn(`[leads webhook] Franchise ${franchiseId} sans Twilio configuré — SMS ignoré pour ${contact.phone}`);
          } else {
          const { data: template } = await supabaseAdmin
            .from("message_templates")
            .select("body")
            .eq("name", "Premier contact")
            .maybeSingle();

          if (template) {
            const name = contact.first_name || "";
            const messageBody = template.body.replace(/\{\{prénom\}\}/g, name);

            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get("host")}`;

            await fetch(`${baseUrl}/api/sms/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contactId: contact.id,
                body: messageBody,
              }),
            });
          }
          } // end else (canSend)
        } catch (smsErr) {
          console.error("[leads webhook] SMS send error:", smsErr);
        }
      }

      return NextResponse.json({ success: true, contact, isNew: !existing });

    } else if (entries.length > 0) {
      // ── FACEBOOK NATIVE FORMAT ──
      // These leads have no phone — they need to be fetched via Facebook API.
      // Assign to Granby by default for now.
      for (const entry of entries) {
        const changes = entry?.changes ?? [];
        for (const change of changes) {
          if (change.field !== "leadgen") continue;
          const leadgenId = change.value?.leadgen_id ?? entry?.id ?? "unknown";
          console.log("[fb-webhook] leadgen received:", leadgenId);

          await supabaseAdmin.from("contacts").insert({
            first_name: "Lead Facebook",
            last_name: leadgenId.slice(0, 8),
            phone: null,
            stage: "nouveau",
            lead_source: "facebook",
            franchise_id: GRANBY_FRANCHISE_ID,
          });
        }
      }
      return NextResponse.json({ ok: true });

    } else {
      return NextResponse.json({ error: "Unknown payload format" }, { status: 400 });
    }
  } catch (err) {
    console.error("[fb-webhook] error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
