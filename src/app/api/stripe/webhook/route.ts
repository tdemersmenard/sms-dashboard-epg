export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAppUrl } from "@/config/brand";
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
            supabaseAdmin.from("contacts").select("first_name, last_name, notes, franchise_id").eq("id", contactId).single(),
            supabaseAdmin.from("payments").select("amount").eq("id", paymentId).single(),
          ]);

          const clientName = contact
            ? [contact.first_name, contact.last_name].filter(Boolean).join(" ")
            : "Client";

          const isDeposit2027 = (existingPayment?.notes ?? "").includes("Dépôt saison 2027");
          const baseUrl = getAppUrl();

          // Notification au propriétaire de la franchise du contact
          const franchiseId = contact?.franchise_id ?? "00000000-0000-0000-0000-000000000001";
          const { data: fr } = await supabaseAdmin.from("franchises").select("owner_phone").eq("id", franchiseId).single();
          const { data: owner } = fr?.owner_phone
            ? await supabaseAdmin.from("contacts").select("id").eq("phone", fr.owner_phone).eq("franchise_id", franchiseId).maybeSingle()
            : { data: null };

          if (owner) {
            await fetch(`${baseUrl}/api/sms/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contactId: owner.id,
                body: isDeposit2027
                  ? `💰 DÉPÔT REÇU — ${clientName} vient de payer son dépôt de ${payment?.amount ?? "?"}$ pour la saison 2027. RÉSERVÉ ✅`
                  : `CHLORE: Paiement Stripe reçu! ${clientName} a payé ${payment?.amount ?? "?"}$ par carte de crédit.`,
              }),
            });
          }

          // Dépôt saison 2027: marquer RÉSERVÉ + confirmer au client + désamorcer les relances
          if (isDeposit2027) {
            const cleanedNotes = (contact?.notes ?? "")
              .split("\n")
              .filter((l: string) => !l.startsWith("RELANCE_PREVUE:"))
              .join("\n");
            await supabaseAdmin.from("contacts").update({
              stage: "closé",
              notes: `${cleanedNotes}\n✅ RÉSERVÉ 2027 — dépôt ${payment?.amount ?? "?"}$ reçu le ${new Date().toLocaleDateString("en-CA", { timeZone: "America/Montreal" })} (sera déduit de la facture). Rabais 10% acquis.`.trim(),
            }).eq("id", contactId);

            await fetch(`${baseUrl}/api/sms/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contactId,
                body: `C'est officiel${contact?.first_name ? " " + contact.first_name : ""} — ta saison 2027 est RÉSERVÉE 🌊 Ton dépôt de ${payment?.amount ?? "?"}$ est confirmé (déduit de ta facture) pis ton -10% est barré. On se reparle au printemps pour l'ouverture. Merci! — l'équipe ALTAMAR`,
              }),
            });

            await supabaseAdmin.from("automation_logs").insert({
              action: "saison_2027_reserve",
              contact_id: contactId,
              status: "success",
              details: { amount: payment?.amount, payment_id: paymentId },
              franchise_id: franchiseId,
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
