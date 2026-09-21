import crypto from "crypto";

/**
 * Meta Conversions API (server-side) — dédupliquée avec le Pixel client
 * via event_id partagé. No-op silencieux si les env vars manquent.
 *
 * Env requis: NEXT_PUBLIC_META_PIXEL_ID + META_CAPI_TOKEN
 */

const GRAPH_URL = "https://graph.facebook.com/v21.0";

export interface CapiEvent {
  eventName: "PageView" | "ViewContent" | "Lead" | "InitiateCheckout" | "Purchase";
  eventId: string;
  sourceUrl?: string;
  /** Téléphone E.164 — hashé SHA-256 avant envoi, jamais transmis en clair */
  phone?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  customData?: Record<string, unknown>;
  /** Pour les tests dans Events Manager (Test Events tab) */
  testEventCode?: string;
}

const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

export async function sendCapiEvent(ev: CapiEvent): Promise<boolean> {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;
  if (!pixelId || !token) return false;

  const userData: Record<string, unknown> = {};
  if (ev.phone) userData.ph = [sha256(ev.phone.replace(/\D/g, ""))];
  if (ev.clientIp) userData.client_ip_address = ev.clientIp;
  if (ev.userAgent) userData.client_user_agent = ev.userAgent;

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: ev.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: ev.eventId,
        action_source: "website",
        ...(ev.sourceUrl ? { event_source_url: ev.sourceUrl } : {}),
        user_data: userData,
        ...(ev.customData ? { custom_data: ev.customData } : {}),
      },
    ],
    ...(ev.testEventCode || process.env.META_TEST_EVENT_CODE
      ? { test_event_code: ev.testEventCode || process.env.META_TEST_EVENT_CODE }
      : {}),
  };

  try {
    const res = await fetch(`${GRAPH_URL}/${pixelId}/events?access_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error("[meta-capi]", ev.eventName, await res.text().catch(() => res.status));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[meta-capi]", ev.eventName, e);
    return false;
  }
}
