export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { BRAND, getAppUrl } from "@/config/brand";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-12-18.acacia" });

/**
 * Lien de paiement permanent: /api/pay/{paymentId}
 * Crée une session Stripe Checkout fraîche à chaque clic et redirige —
 * le lien envoyé par SMS n'expire donc jamais (contrairement aux sessions).
 * Le paymentId (UUID) sert de capacité non devinable.
 */
export async function GET(req: NextRequest, { params }: { params: { paymentId: string } }) {
  const { paymentId } = params;

  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("id, amount, status, notes, contact_id")
    .eq("id", paymentId)
    .maybeSingle();

  if (!payment) return new NextResponse("Paiement introuvable", { status: 404 });

  // Retour de Stripe après succès (le webhook confirme en parallèle)
  if (new URL(req.url).searchParams.get("done") === "1") {
    return new NextResponse(
      `<html><body style="font-family:sans-serif;text-align:center;padding:60px 20px;background:#f3f7fa">
        <h2 style="color:#0a1628">🌊 Merci — paiement complété!</h2>
        <p style="color:#52708a">Ta confirmation s'en vient par texto. Bienvenue chez ${BRAND.name}! 🌊</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  if (payment.status === "reçu") {
    return new NextResponse(
      `<html><body style="font-family:sans-serif;text-align:center;padding:60px 20px;background:#f3f7fa">
        <h2 style="color:#0a1628">✅ Déjà payé — merci!</h2>
        <p style="color:#52708a">Ce paiement a déjà été reçu. Ta place est réservée 🌊</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const description = (payment.notes || "").includes("Dépôt saison 2027")
    ? "Dépôt saison 2027 — déduit de la facture"
    : payment.notes || "Paiement de service";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "cad",
          unit_amount: Math.round(Number(payment.amount) * 100),
          product_data: { name: `${BRAND.name} — ${description}` },
        },
        quantity: 1,
      },
    ],
    metadata: { payment_id: payment.id, contact_id: payment.contact_id ?? "" },
    success_url: `${getAppUrl()}/api/pay/${payment.id}?done=1`,
    cancel_url: `${getAppUrl()}/api/pay/${payment.id}`,
  });

  return NextResponse.redirect(session.url!, 303);
}
