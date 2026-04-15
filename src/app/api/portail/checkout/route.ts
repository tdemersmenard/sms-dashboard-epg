export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import Stripe from "stripe";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-12-18.acacia" as any });

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("portal_token")?.value ?? req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("id, email, portal_token_expires")
      .eq("portal_token", token)
      .single();

    if (!contact || new Date(contact.portal_token_expires) < new Date()) {
      return NextResponse.json({ error: "Session expirée" }, { status: 401 });
    }

    // Accept optional paymentId to pay a specific pending payment
    const body = await req.json().catch(() => ({}));
    const { paymentId } = body as { paymentId?: string };

    let amountToPay: number;
    let description: string;
    let paymentRowId: string;

    if (paymentId) {
      // Use the specific payment requested
      const { data: specificPayment } = await supabaseAdmin
        .from("payments")
        .select("id, amount, notes")
        .eq("id", paymentId)
        .eq("contact_id", contact.id)
        .eq("status", "en_attente")
        .single();

      if (!specificPayment) {
        return NextResponse.json({ error: "Paiement non trouvé" }, { status: 404 });
      }

      amountToPay = specificPayment.amount;
      description = specificPayment.notes || "Service de piscine";
      paymentRowId = specificPayment.id;
    } else {
      // Fallback: take the first pending payment ordered by due_date
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

      amountToPay = pendingList[0].amount;
      description = pendingList[0].notes || "Service de piscine";
      paymentRowId = pendingList[0].id;
    }

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
      success_url: `${baseUrl}/portail/paiements?payment=success`,
      cancel_url: `${baseUrl}/portail/paiements?payment=cancel`,
      customer_email: contact.email || undefined,
      metadata: {
        payment_id: paymentRowId,
        contact_id: contact.id,
      },
    });

    return NextResponse.json({ url: session.url, amount: amountToPay, description });
  } catch (err) {
    console.error("[checkout] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
