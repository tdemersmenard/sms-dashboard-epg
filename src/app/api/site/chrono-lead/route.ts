export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { normalizePhone } from "@/lib/utils";
import { GRANBY_FRANCHISE_ID } from "@/lib/franchise";
import { processSaison2027Lead } from "@/lib/meta-saison-2027";

/**
 * CHRONO 30 SECONDES — le site prouve le temps de réponse en direct.
 * POST { phone, poolType?, consent, website? (honeypot) }
 *
 * Crée un lead source "site_chrono" et déclenche le flow SMS existant
 * (message 1 avec prix, comme les leads Meta). Retourne le temps écoulé
 * jusqu'à l'envoi du premier SMS.
 *
 * Anti-abus: honeypot, consentement obligatoire (Loi 25/LCAP), E.164
 * québécois, rate limit 3/jour/IP, dedupe sur numéro déjà en conversation.
 */

const QC_AREA_CODES = new Set(["263", "354", "367", "418", "438", "450", "468", "514", "579", "581", "819", "873"]);
const MAX_PER_IP_PER_DAY = 3;

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const { phone: rawPhone, poolType, consent, website, event_id } = body as Record<string, unknown>;

    // Honeypot: un bot qui remplit le champ caché reçoit un faux succès
    if (typeof website === "string" && website.trim() !== "") {
      return NextResponse.json({ ok: true, elapsed_s: 8.2 });
    }

    if (consent !== true) {
      return NextResponse.json(
        { ok: false, reason: "consentement_requis", message: "Coche la case pour qu'on puisse te texter." },
        { status: 400 },
      );
    }

    const phone = rawPhone ? normalizePhone(String(rawPhone)) : null;
    if (!phone || !/^\+1\d{10}$/.test(phone) || !QC_AREA_CODES.has(phone.slice(2, 5))) {
      return NextResponse.json(
        { ok: false, reason: "telephone_invalide", message: "Entre un cellulaire québécois valide (ex: 450 123-4567)." },
        { status: 400 },
      );
    }

    // ── Rate limit par IP: max 3/jour ──
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "inconnue";
    const todayStart = new Date().toLocaleDateString("en-CA", { timeZone: "America/Montreal" }) + "T00:00:00";
    const { count: ipCount } = await supabaseAdmin
      .from("automation_logs")
      .select("id", { count: "exact", head: true })
      .eq("action", "site_chrono_req")
      .contains("details", { ip })
      .gte("created_at", todayStart);
    if ((ipCount || 0) >= MAX_PER_IP_PER_DAY) {
      return NextResponse.json(
        { ok: false, reason: "rate_limit", message: "Limite atteinte pour aujourd'hui — texte-nous directement au 450 915-9650." },
        { status: 429 },
      );
    }
    await supabaseAdmin.from("automation_logs").insert({
      action: "site_chrono_req",
      status: "success",
      details: { ip, phone_last4: phone.slice(-4) },
      franchise_id: GRANBY_FRANCHISE_ID,
    });

    // ── Dedupe: numéro déjà en conversation → pas de nouveau lead, pas de doublon SMS ──
    const { data: existing } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("phone", phone)
      .eq("franchise_id", GRANBY_FRANCHISE_ID)
      .maybeSingle();
    if (existing) {
      const { data: prior } = await supabaseAdmin
        .from("messages").select("id").eq("contact_id", existing.id).limit(1);
      if (prior && prior.length > 0) {
        return NextResponse.json({
          ok: false,
          reason: "deja_connu",
          message: "On se connaît déjà! 🌊 Regarde tes textos — ou réponds-nous directement, on est là.",
        });
      }
    }

    // ── Déclenche le flow existant (mêmes SMS que les leads Meta) ──
    const pool = poolType === "creusée" ? "creusée" : poolType === "hors-terre" ? "hors-terre" : "";
    const logs = await processSaison2027Lead(
      { firstName: null, phone, city: null, poolTypeRaw: pool, readinessRaw: "veut le prix" },
      {
        leadgen_id: `site_chrono_${t0}`,
        ad_id: null, adset_id: null, campaign_id: null, form_id: null,
        ad_name: "Chrono 30s (site)", campaign_name: "Site ALTAMAR",
      },
      GRANBY_FRANCHISE_ID,
    );

    // Attribution: la vraie source est le site, pas Meta
    const { data: lead } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("phone", phone)
      .eq("franchise_id", GRANBY_FRANCHISE_ID)
      .maybeSingle();
    if (lead) {
      await supabaseAdmin.from("contacts").update({ lead_source: "site_chrono" }).eq("id", lead.id);
    }

    // ── Temps réel jusqu'au premier SMS parti ──
    let elapsed_s: number | null = null;
    if (lead) {
      const { data: firstOut } = await supabaseAdmin
        .from("messages")
        .select("created_at")
        .eq("contact_id", lead.id)
        .eq("direction", "outbound")
        .gte("created_at", new Date(t0).toISOString())
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (firstOut) {
        elapsed_s = Math.round((new Date(firstOut.created_at).getTime() - t0) / 100) / 10;
      }
    }

    const smsSent = logs.some((l) => l.includes("✅ SMS lead envoyé"));
    if (!smsSent) {
      return NextResponse.json(
        { ok: false, reason: "envoi_echoue", message: "Petit pépin de notre côté — texte-nous au 450 915-9650 et on te répond aussi vite." },
        { status: 500 },
      );
    }

    // Meta CAPI: Lead (même event_id que le fbq('track','Lead') du client → dédup)
    try {
      const { sendCapiEvent } = await import("@/lib/meta-capi");
      await sendCapiEvent({
        eventName: "Lead",
        eventId: typeof event_id === "string" && event_id.length <= 80 ? event_id : `lead_chrono_${t0}`,
        sourceUrl: req.headers.get("referer") || undefined,
        phone,
        clientIp: ip,
        userAgent: req.headers.get("user-agent"),
        customData: { content_name: "chrono_30s" },
      });
    } catch (e) { console.error("[chrono-lead] capi:", e); }

    return NextResponse.json({ ok: true, elapsed_s: elapsed_s ?? Math.round((Date.now() - t0) / 100) / 10 });
  } catch (e) {
    console.error("[chrono-lead]", e);
    return NextResponse.json(
      { ok: false, reason: "erreur", message: "Petit pépin — réessaie ou texte-nous au 450 915-9650." },
      { status: 500 },
    );
  }
}
