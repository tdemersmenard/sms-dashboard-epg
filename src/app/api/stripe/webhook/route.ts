export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-12-18.acacia" });

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const sig = req.headers.get("stripe-signature");

    let event: Stripe.Event;

    if (process.env.STRIPE_WEBHOOK_SECRET && sig) {
      event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } else {
      event = JSON.parse(body) as Stripe.Event;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const paymentId = session.metadata?.payment_id;
      const contactId = session.metadata?.contact_id;

      if (paymentId) {
        const { data: existingPayment } = await supabaseAdmin
          .from("payments")
          .select("notes")
          .eq("id", paymentId)
          .single();

        await supabaseAdmin.from("payments").update({
          status: "reçu",
          method: "stripe",
          received_date: new Date().toISOString().split("T")[0],
          notes: (existingPayment?.notes ?? "") + " — Payé par Stripe",
        }).eq("id", paymentId);

        if (contactId) {
          const [{ data: contact }, { data: payment }] = await Promise.all([
            supabaseAdmin.from("contacts").select("first_name, last_name").eq("id", contactId).single(),
            supabaseAdmin.from("payments").select("amount").eq("id", paymentId).single(),
          ]);

          const clientName = contact
            ? [contact.first_name, contact.last_name].filter(Boolean).join(" ")
            : "Client";

          const { data: thomas } = await supabaseAdmin
            .from("contacts")
            .select("id")
            .eq("phone", "+14509942215")
            .single();

          if (thomas) {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";
            await fetch(`${baseUrl}/api/sms/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contactId: thomas.id,
                body: `CHLORE: Paiement Stripe reçu! ${clientName} a payé ${payment?.amount ?? "?"}$ par carte de crédit.`,
              }),
            });
          }
        }

        console.log("[stripe-webhook] Payment confirmed:", paymentId);
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[stripe-webhook] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
