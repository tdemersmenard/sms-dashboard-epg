export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-12-18.acacia" });

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("id, first_name, last_name, email, portal_token_expires")
      .eq("portal_token", token)
      .single();

    if (!contact || new Date(contact.portal_token_expires) < new Date()) {
      return NextResponse.json({ error: "Session expirée" }, { status: 401 });
    }

    const { paymentId } = await req.json();

    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select("id, amount, notes, contact_id")
      .eq("id", paymentId)
      .eq("contact_id", contact.id)
      .eq("status", "en_attente")
      .single();

    if (!payment) {
      return NextResponse.json({ error: "Paiement non trouvé" }, { status: 404 });
    }

    const clientName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Client";
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "cad",
          product_data: {
            name: `Entretien Piscine Granby — ${payment.notes || "Service"}`,
            description: `Paiement pour ${clientName}`,
          },
          unit_amount: Math.round(payment.amount * 100),
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: `${baseUrl}/portail/dashboard?payment=success&paymentId=${payment.id}`,
      cancel_url: `${baseUrl}/portail/dashboard?payment=cancel`,
      customer_email: contact.email || undefined,
      metadata: {
        payment_id: payment.id,
        contact_id: contact.id,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[checkout] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
