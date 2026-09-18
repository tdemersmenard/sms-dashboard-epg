export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { BRAND, getAppUrl } from "@/config/brand";
import { normalizePhone } from "@/lib/utils";
import { GRANBY_FRANCHISE_ID } from "@/lib/franchise";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-12-18.acacia" });

/** Grille /reserver — mêmes chiffres que le funnel SMS (source: meta-saison-2027) */
const TIERS: Record<string, Record<string, { fullPrice: number; finalPrice: number; deposit: number }>> = {
  signature: {
    "hors-terre": { fullPrice: 1800, finalPrice: 1620, deposit: 180 },
    "creusée": { fullPrice: 2200, finalPrice: 1980, deposit: 220 },
  },
  essentiel: {
    "hors-terre": { fullPrice: 1300, finalPrice: 1170, deposit: 130 },
    "creusée": { fullPrice: 1500, finalPrice: 1350, deposit: 150 },
  },
};
const OFFER_DEADLINE = "2026-11-01";

/**
 * Checkout self-serve public: crée/tagge le contact, crée le dépôt et
 * redirige vers Stripe. Le webhook Stripe finalise (RÉSERVÉ + versements + SMS).
 */
export async function POST(req: NextRequest) {
  try {
    const { firstName, phone: rawPhone, poolType, spa, tier, plan } = await req.json();

    const phone = rawPhone ? normalizePhone(String(rawPhone)) : null;
    if (!phone || !/^\+1\d{10}$/.test(phone)) {
      return NextResponse.json({ error: "Numéro de téléphone invalide" }, { status: 400 });
    }
    const pool = poolType === "creusée" ? "creusée" : "hors-terre";
    const tierKey = tier === "essentiel" ? "essentiel" : "signature";
    const planKey = plan === "4x" ? "4x" : "comptant";
    const pricing = TIERS[tierKey][pool];

    const beforeDeadline = new Date().toLocaleDateString("en-CA", { timeZone: "America/Montreal" }) < OFFER_DEADLINE;
    const price = beforeDeadline ? pricing.finalPrice : pricing.fullPrice;
    const deposit = pricing.deposit;

    // ── Contact: find-or-create + tag self-serve ──
    let { data: contact } = await supabaseAdmin
      .from("contacts").select("id, notes, first_name")
      .eq("phone", phone).eq("franchise_id", GRANBY_FRANCHISE_ID).maybeSingle();

    const selfServeNote = [
      `TAG:self-serve`,
      `RÉSERVATION SELF-SERVE (${new Date().toLocaleDateString("en-CA", { timeZone: "America/Montreal" })}): forfait ${tierKey.toUpperCase()}, ${pool}${spa ? " + spa" : ""}, ${planKey === "4x" ? "4 versements" : "comptant"} — ${price}$${beforeDeadline ? " (-10% appliqué)" : ""}, dépôt ${deposit}$.`,
    ].join("\n");

    if (contact) {
      const updates: Record<string, unknown> = {
        notes: [(contact.notes || "").trim(), selfServeNote].filter(Boolean).join("\n"),
        pool_type: pool,
        ...(spa ? { has_spa: true } : {}),
      };
      if (firstName && !contact.first_name) updates.first_name = String(firstName).trim().split(/\s+/)[0];
      await supabaseAdmin.from("contacts").update(updates).eq("id", contact.id);
    } else {
      const { data: created, error } = await supabaseAdmin
        .from("contacts")
        .insert({
          phone,
          first_name: firstName ? String(firstName).trim().split(/\s+/)[0] : null,
          franchise_id: GRANBY_FRANCHISE_ID,
          lead_source: "self_serve",
          stage: "nouveau",
          pool_type: pool,
          ...(spa ? { has_spa: true } : {}),
          notes: selfServeNote,
        })
        .select("id")
        .single();
      if (error || !created) throw new Error(error?.message || "création contact échouée");
      contact = { id: created.id, notes: selfServeNote, first_name: firstName ?? null };
    }

    // ── Dépôt (réutilise s'il existe, ajuste le montant au palier choisi) ──
    const { data: existingDep } = await supabaseAdmin
      .from("payments").select("id, status")
      .eq("contact_id", contact.id).ilike("notes", "%Dépôt saison 2027%").maybeSingle();

    const depNotes = `Dépôt saison 2027 — déduit de la facture (${pool}${tierKey === "essentiel" ? ", ESSENTIEL" : ""}, self-serve)`;
    let paymentId: string;
    if (existingDep && existingDep.status === "en_attente") {
      await supabaseAdmin.from("payments").update({ amount: deposit, notes: depNotes }).eq("id", existingDep.id);
      paymentId = existingDep.id;
    } else if (existingDep) {
      return NextResponse.json({ error: "Un dépôt a déjà été payé pour ce numéro — contacte-nous par texto!" }, { status: 409 });
    } else {
      const { data: pay, error } = await supabaseAdmin
        .from("payments")
        .insert({
          contact_id: contact.id,
          amount: deposit,
          method: "stripe",
          status: "en_attente",
          due_date: OFFER_DEADLINE,
          notes: depNotes,
          franchise_id: GRANBY_FRANCHISE_ID,
        })
        .select("id")
        .single();
      if (error || !pay) throw new Error(error?.message || "création dépôt échouée");
      paymentId = pay.id;
    }

    // ── Session Stripe ──
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "cad",
            unit_amount: deposit * 100,
            product_data: {
              name: `${BRAND.name} — Dépôt saison 2027 (forfait ${tierKey === "essentiel" ? "Essentiel" : "Signature"}, ${pool})`,
              description: `Saison à ${price}$${planKey === "4x" ? " en 4 versements" : ""} — dépôt déduit de la facture de mai`,
            },
          },
          quantity: 1,
        },
      ],
      ...(planKey === "4x" ? { payment_intent_data: { setup_future_usage: "off_session" as const } } : {}),
      metadata: { payment_id: paymentId, contact_id: contact.id, plan: planKey, source: "self_serve" },
      success_url: `${getAppUrl()}/reserver?done=1`,
      cancel_url: `${getAppUrl()}/reserver`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    console.error("[reserver] checkout error:", err);
    return NextResponse.json({ error: "Une erreur est survenue — réessaie ou texte-nous!" }, { status: 500 });
  }
}
