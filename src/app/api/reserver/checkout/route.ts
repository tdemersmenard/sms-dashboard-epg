export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { BRAND, getAppUrl } from "@/config/brand";
import { normalizePhone } from "@/lib/utils";
import { firstNameFrom } from "@/lib/name";
import { GRANBY_FRANCHISE_ID } from "@/lib/franchise";
import { getPricingConfig, effectivePricing } from "@/lib/pricing";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-12-18.acacia" });


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
    const planKey = plan === "mensuel" ? "mensuel" : plan === "4x" ? "4x" : "comptant";
    // Source unique des prix: settings.pricing_config (src/lib/pricing.ts)
    const cfg = await getPricingConfig();
    const eff = effectivePricing(cfg, tierKey, pool);
    const beforeDeadline = eff.promoActive;
    const price = eff.price;
    const deposit = eff.deposit;

    // ── Contact: find-or-create + tag self-serve ──
    let { data: contact } = await supabaseAdmin
      .from("contacts").select("id, notes, first_name")
      .eq("phone", phone).eq("franchise_id", GRANBY_FRANCHISE_ID).maybeSingle();

    const selfServeNote = [
      `TAG:self-serve`,
      `RÉSERVATION SELF-SERVE (${new Date().toLocaleDateString("en-CA", { timeZone: "America/Montreal" })}): forfait ${tierKey.toUpperCase()}, ${pool}${spa ? " + spa" : ""}, ${planKey === "mensuel" ? `mensuel ${eff.monthly}$/mois ×12` : planKey === "4x" ? "4 versements" : "comptant"} — ${price}$${beforeDeadline ? " (-10% appliqué)" : ""}${planKey === "mensuel" ? " (prélèvement 1 = dépôt, déduit du total)" : `, dépôt ${deposit}$`}.`,
    ].join("\n");

    if (contact) {
      const updates: Record<string, unknown> = {
        notes: [(contact.notes || "").trim(), selfServeNote].filter(Boolean).join("\n"),
        pool_type: pool,
        ...(spa ? { has_spa: true } : {}),
      };
      if (firstName && !contact.first_name) updates.first_name = firstNameFrom(String(firstName));
      await supabaseAdmin.from("contacts").update(updates).eq("id", contact.id);
    } else {
      const { data: created, error } = await supabaseAdmin
        .from("contacts")
        .insert({
          phone,
          first_name: firstName ? firstNameFrom(String(firstName)) : null,
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

    const depNotes = planKey === "mensuel"
      ? `Dépôt saison 2027 — mensuel, prélèvement 1 de 12 (${eff.monthly}$/mois, ${pool}${tierKey === "essentiel" ? ", ESSENTIEL" : ""}, self-serve)`
      : `Dépôt saison 2027 — déduit de la facture (${pool}${tierKey === "essentiel" ? ", ESSENTIEL" : ""}, self-serve)`;
    const firstCharge = planKey === "mensuel" ? Math.round(eff.monthly * 100) / 100 : deposit;
    let paymentId: string;
    if (existingDep && existingDep.status === "en_attente") {
      await supabaseAdmin.from("payments").update({ amount: firstCharge, notes: depNotes }).eq("id", existingDep.id);
      paymentId = existingDep.id;
    } else if (existingDep) {
      return NextResponse.json({ error: "Un dépôt a déjà été payé pour ce numéro — contacte-nous par texto!" }, { status: 409 });
    } else {
      const { data: pay, error } = await supabaseAdmin
        .from("payments")
        .insert({
          contact_id: contact.id,
          amount: firstCharge,
          method: "stripe",
          status: "en_attente",
          due_date: cfg.promo.ends_at,
          notes: depNotes,
          franchise_id: GRANBY_FRANCHISE_ID,
        })
        .select("id")
        .single();
      if (error || !pay) throw new Error(error?.message || "création dépôt échouée");
      paymentId = pay.id;
    }

    // ── Session Stripe ──
    const tierLabel = tierKey === "essentiel" ? "Essentiel" : "Signature";
    const session = planKey === "mensuel"
      ? await stripe.checkout.sessions.create({
          // Abonnement 12 mois: contrat de saison — le webhook fixe cancel_at
          // après 12 prélèvements; aucune annulation self-serve.
          mode: "subscription",
          line_items: [
            {
              price_data: {
                currency: "cad",
                unit_amount: Math.round(eff.monthly * 100),
                recurring: { interval: "month" },
                product_data: {
                  name: `${BRAND.name} — Saison 2027 au mois (forfait ${tierLabel}, ${pool})`,
                  description: `12 prélèvements de ${eff.monthly}$ (total ${price}$${beforeDeadline ? ", -10% appliqué" : ""}). Contrat de saison — le premier prélèvement réserve ta place.`,
                },
              },
              quantity: 1,
            },
          ],
          metadata: { payment_id: paymentId, contact_id: contact.id, plan: "mensuel", tier: tierKey, pool, source: "self_serve" },
          subscription_data: { metadata: { payment_id: paymentId, contact_id: contact.id, plan: "mensuel", saison: "2027" } },
          success_url: `${getAppUrl()}/reserver?done=1`,
          cancel_url: `${getAppUrl()}/reserver`,
        })
      : await stripe.checkout.sessions.create({
          mode: "payment",
          line_items: [
            {
              price_data: {
                currency: "cad",
                unit_amount: deposit * 100,
                product_data: {
                  name: `${BRAND.name} — Dépôt saison 2027 (forfait ${tierLabel}, ${pool})`,
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
