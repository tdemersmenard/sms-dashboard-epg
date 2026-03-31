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
    console.log("[fb-webhook] Verification OK");
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

// POST — Receive Facebook Lead Ads events
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    console.log("[fb-webhook] payload:", JSON.stringify(payload, null, 2));

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

        if (error) {
          console.error("[fb-webhook] insert error:", error);
        } else {
          console.log("[fb-webhook] created contact:", contact?.id, "leadgen_id:", leadgenId);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[fb-webhook] error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
