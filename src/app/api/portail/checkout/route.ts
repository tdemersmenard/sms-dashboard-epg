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
      .select("id, first_name, last_name, email, season_price, services, portal_token_expires")
      .eq("portal_token", token)
      .single();

    if (!contact || new Date(contact.portal_token_expires) < new Date()) {
      return NextResponse.json({ error: "Session expirée" }, { status: 401 });
    }

    const seasonPrice = contact.season_price || 0;
    const services: string[] = contact.services || [];

    // Fetch payments already received
    const { data: receivedPayments } = await supabaseAdmin
      .from("payments")
      .select("amount, status")
      .eq("contact_id", contact.id)
      .eq("status", "reçu");

    const totalPaid = (receivedPayments || []).reduce((sum, p) => sum + (p.amount || 0), 0);

    let amountToPay = 0;
    let description = "";
    let pendingPaymentId: string | null = null;

    // Priority: use manually-created pending payment if one exists
    const { data: manualPendingList } = await supabaseAdmin
      .from("payments")
      .select("id, amount, notes")
      .eq("contact_id", contact.id)
      .eq("status", "en_attente")
      .neq("method", "stripe")
      .order("created_at", { ascending: true })
      .limit(1);

    const manualPending = manualPendingList?.[0] ?? null;

    if (manualPending) {
      // Use the manually-created pending payment as-is
      amountToPay = manualPending.amount;
      description = manualPending.notes || "Service de piscine";
      pendingPaymentId = manualPending.id;
    } else {
      // Calculate automatically from season_price and services
      const isEntretien = services.some(s => s.includes("entretien"));

      if (isEntretien) {
        const halfPrice = Math.ceil(seasonPrice / 2);
        if (totalPaid === 0) {
          amountToPay = halfPrice;
          description = `Versement 1/2 — Entretien de piscine saison 2026`;
        } else if (totalPaid < seasonPrice) {
          amountToPay = seasonPrice - totalPaid;
          description = `Versement 2/2 — Entretien de piscine saison 2026`;
        }
      } else {
        amountToPay = seasonPrice - totalPaid;
        description = `Paiement complet — Service de piscine`;
      }

      if (amountToPay <= 0) {
        return NextResponse.json({ error: "Aucun montant à payer" }, { status: 400 });
      }

      // Delete only Stripe-generated stale pending payments
      await supabaseAdmin
        .from("payments")
        .delete()
        .eq("contact_id", contact.id)
        .eq("status", "en_attente")
        .eq("method", "stripe");

      // Create fresh Stripe pending payment record
      const { data: created } = await supabaseAdmin.from("payments").insert({
        contact_id: contact.id,
        amount: amountToPay,
        method: "stripe",
        status: "en_attente",
        notes: description,
      }).select("id").single();
      pendingPaymentId = created?.id ?? null;
    }

    if (amountToPay <= 0) {
      return NextResponse.json({ error: "Aucun montant à payer" }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "cad",
          product_data: {
            name: `Entretien Piscine Granby`,
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
        payment_id: pendingPaymentId ?? "",
        contact_id: contact.id,
      },
    });

    return NextResponse.json({ url: session.url, amount: amountToPay, description });
  } catch (err) {
    console.error("[checkout] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
