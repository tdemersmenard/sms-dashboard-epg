export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import Stripe from "stripe";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-12-18.acacia" as any });

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("id, email, portal_token_expires")
      .eq("portal_token", token)
      .single();

    if (!contact || new Date(contact.portal_token_expires) < new Date()) {
      return NextResponse.json({ error: "Session expirée" }, { status: 401 });
    }

    // Take the first pending payment ordered by due_date
    const { data: pendingList } = await supabaseAdmin
      .from("payments")
      .select("id, amount, notes")
      .eq("contact_id", contact.id)
      .eq("status", "en_attente")
      .order("due_date", { ascending: true })
      .limit(1);

    if (!pendingList || pendingList.length === 0) {
      return NextResponse.json({ error: "Aucun paiement en attente" }, { status: 400 });
    }

    const payment = pendingList[0];
    const amountToPay = payment.amount;
    const description = payment.notes || "Service de piscine";

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "cad",
          product_data: {
            name: "Entretien Piscine Granby",
            description,
          },
          unit_amount: Math.round(amountToPay * 100),
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: `${baseUrl}/portail/dashboard?payment=success`,
      cancel_url: `${baseUrl}/portail/dashboard?payment=cancel`,
      customer_email: contact.email || undefined,
      metadata: {
        payment_id: payment.id,
        contact_id: contact.id,
      },
    });

    return NextResponse.json({ url: session.url, amount: amountToPay, description });
  } catch (err) {
    console.error("[checkout] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
