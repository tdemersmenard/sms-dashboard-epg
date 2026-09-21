export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sendCapiEvent } from "@/lib/meta-capi";

const ALLOWED = new Set(["PageView", "ViewContent", "Lead", "InitiateCheckout"]);

/**
 * Relais Conversions API pour les events déclenchés côté client.
 * Le client envoie le même event_id qu'il passe à fbq() → Meta déduplique.
 * (Purchase est envoyé directement par le webhook Stripe, jamais d'ici.)
 */
export async function POST(req: NextRequest) {
  try {
    const { event, event_id, url, custom } = await req.json();
    if (!ALLOWED.has(event) || typeof event_id !== "string" || event_id.length > 80) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const ok = await sendCapiEvent({
      eventName: event,
      eventId: event_id,
      sourceUrl: typeof url === "string" ? url.slice(0, 300) : undefined,
      clientIp: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null,
      userAgent: req.headers.get("user-agent"),
      customData: custom && typeof custom === "object" ? custom : undefined,
    });
    return NextResponse.json({ ok });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
