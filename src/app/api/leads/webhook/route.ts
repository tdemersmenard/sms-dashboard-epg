export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

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
      const phone = body.phone || null;
      const email = body.email || null;

      if (!firstName && body.name) {
        const parts = body.name.trim().split(" ");
        firstName = parts[0] || null;
        lastName = parts.slice(1).join(" ") || null;
      }

      if (!phone) {
        return NextResponse.json({ error: "phone is required" }, { status: 400 });
      }

      // Check if contact already exists
      const { data: existing } = await supabaseAdmin
        .from("contacts")
        .select("id, phone")
        .eq("phone", phone)
        .maybeSingle();

      let contact;

      if (existing) {
        const { data } = await supabaseAdmin
          .from("contacts")
          .update({
            ...(firstName && { first_name: firstName }),
            ...(lastName && { last_name: lastName }),
            ...(email && { email }),
          })
          .eq("id", existing.id)
          .select()
          .single();
        contact = data;
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
          })
          .select()
          .single();
        contact = data;
      }

      // Send SMS only for NEW contacts
      if (!existing && contact && contact.phone) {
        try {
          const { data: template } = await supabaseAdmin
            .from("message_templates")
            .select("body")
            .eq("name", "Premier contact")
            .single();

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
        } catch (smsErr) {
          console.error("[leads webhook] SMS send error:", smsErr);
        }
      }

      return NextResponse.json({ success: true, contact, isNew: !existing });

    } else if (entries.length > 0) {
      // ── FACEBOOK NATIVE FORMAT ──
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
