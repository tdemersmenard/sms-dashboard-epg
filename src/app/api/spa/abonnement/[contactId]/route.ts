export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { BRAND, getAppUrl } from "@/config/brand";
import { SPA_PRICING } from "@/lib/meta-saison-2027";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-12-18.acacia" });

/**
 * Lien d'abonnement spa permanent: /api/spa/abonnement/{contactId}?plan=2sem|mensuel|residence
 * Crée une session Stripe Checkout en mode SUBSCRIPTION (mensuel récurrent,
 * engagement minimum 3 mois indiqué — pas de dépôt). Le webhook finalise.
 */
export async function GET(req: NextRequest, { params }: { params: { contactId: string } }) {
  const { contactId } = params;
  const planKey = (new URL(req.url).searchParams.get("plan") ?? "mensuel") as keyof typeof SPA_PRICING;
  const plan = SPA_PRICING[planKey] ?? SPA_PRICING["mensuel"];

  const { data: contact } = await supabaseAdmin
    .from("contacts").select("id, first_name, notes").eq("id", contactId).maybeSingle();
  if (!contact) return new NextResponse("Client introuvable", { status: 404 });

  if (new URL(req.url).searchParams.get("done") === "1") {
    return new NextResponse(
      `<html><body style="font-family:sans-serif;text-align:center;padding:60px 20px;background:#f3f7fa">
        <h2 style="color:#0a1628">🌊 Ton entretien spa est parti!</h2>
        <p style="color:#52708a">Ta confirmation s'en vient par texto. Bienvenue chez ${BRAND.name}!</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  if ((contact.notes || "").includes("ABONNEMENT SPA ACTIF")) {
    return new NextResponse(
      `<html><body style="font-family:sans-serif;text-align:center;padding:60px 20px;background:#f3f7fa">
        <h2 style="color:#0a1628">✅ Déjà abonné — merci!</h2>
        <p style="color:#52708a">Ton entretien spa est déjà actif. Une question? Texte-nous!</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [
      {
        price_data: {
          currency: "cad",
          unit_amount: plan.monthly * 100,
          recurring: { interval: "month" },
          product_data: {
            name: `${BRAND.name} — Entretien spa ${plan.label}`,
            description: "Chimie balancée, filtre, ligne d'eau, équipement vérifié, produits inclus, changement d'eau 1x/an. Engagement minimum 3 mois.",
          },
        },
        quantity: 1,
      },
    ],
    metadata: { contact_id: contact.id, spa_plan: planKey },
    subscription_data: { metadata: { contact_id: contact.id, spa_plan: planKey } },
    success_url: `${getAppUrl()}/api/spa/abonnement/${contact.id}?done=1`,
    cancel_url: `${getAppUrl()}/api/spa/abonnement/${contact.id}?plan=${planKey}`,
  });

  return NextResponse.redirect(session.url!, 303);
}
