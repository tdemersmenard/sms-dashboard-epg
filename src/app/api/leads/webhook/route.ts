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
    const payload = await req.json();
    const body = payload;

    let firstName = body.first_name || null;
    let lastName = body.last_name || null;

    // Si on reçoit "name" au lieu de first_name/last_name (format Make.com)
    if (!firstName && body.name) {
      const parts = body.name.trim().split(" ");
      firstName = parts[0] || null;
      lastName = parts.slice(1).join(" ") || null;
    }

    const entries = payload?.entry ?? [];

    for (const entry of entries) {
      const changes = entry?.changes ?? [];

      for (const change of changes) {
        if (change.field !== "leadgen") continue;

        const leadgenId: string = change.value?.leadgen_id ?? entry?.id ?? "unknown";

        // Create a placeholder contact
        // Real lead data requires a Graph API call with leadgen_id
        // (needs page access token — connect via Facebook App settings)
        const { data: contact, error } = await supabaseAdmin
          .from("contacts")
          .insert({
            first_name: "Lead Facebook",
            last_name: leadgenId.slice(0, 8),
            phone: null,
            stage: "nouveau",
            lead_source: "facebook",
            services: [],
            has_spa: false,
          })
          .select()
          .single();

        const existing = false;

        if (error) {
          console.error("[fb-webhook] insert error:", error);
        }

        if (!existing && contact && contact.phone) {
          try {
            const { data: template } = await supabaseAdmin
              .from("message_templates")
              .select("body")
              .eq("name", "Premier contact")
              .single();

            if (template) {
              const firstName = contact.first_name || "";
              const messageBody = template.body.replace(/\{\{prénom\}\}/g, firstName);

              await fetch(new URL("/api/sms/send", req.url).toString(), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contactId: contact.id,
                  body: messageBody,
                }),
              });
            }
          } catch (smsErr) {
            console.error("[leads webhook] SMS error:", smsErr);
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[fb-webhook] error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
