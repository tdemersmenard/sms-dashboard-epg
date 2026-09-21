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
      // Meta CAPI: Purchase (dédup par session.id — jamais refiré côté client)
      try {
        const { sendCapiEvent } = await import("@/lib/meta-capi");
        const s0 = event.data.object as { id: string; amount_total?: number | null; metadata?: Record<string, string> };
        await sendCapiEvent({
          eventName: "Purchase",
          eventId: `purchase_${s0.id}`,
          customData: {
            currency: "CAD",
            value: (s0.amount_total ?? 0) / 100,
            content_name: s0.metadata?.spa_plan ? "abonnement_spa" : "depot_saison_2027",
          },
        });
      } catch (e) { console.error("[stripe-webhook] capi purchase:", e); }

      const session = event.data.object as Stripe.Checkout.Session;
      const paymentId = session.metadata?.payment_id;
      const contactId = session.metadata?.contact_id;

      // ── Abonnement SPA (mode subscription, pas de payment row) ──
      if (session.metadata?.spa_plan && contactId) {
        const planLabel = session.metadata.spa_plan === "2sem" ? "aux 2 semaines (160$/mois)"
          : session.metadata.spa_plan === "residence" ? "Résidence Complète (325$/mois)"
          : "mensuel (110$/mois)";
        const { data: spaContact } = await supabaseAdmin
          .from("contacts").select("first_name, last_name, notes, franchise_id, services").eq("id", contactId).single();
        await supabaseAdmin.from("contacts").update({
          stage: "closé",
          has_spa: true,
          services: Array.from(new Set([...(spaContact?.services ?? []), "entretien spa"])),
          notes: `${(spaContact?.notes ?? "").trim()}\n✅ ABONNEMENT SPA ACTIF: ${planLabel} — démarré le ${new Date().toLocaleDateString("en-CA", { timeZone: "America/Montreal" })} (Stripe sub: ${typeof session.subscription === "string" ? session.subscription : "?"}). Engagement min. 3 mois.`.trim(),
        }).eq("id", contactId);

        const spaBase = getAppUrl();
        const clientName = spaContact ? [spaContact.first_name, spaContact.last_name].filter(Boolean).join(" ") : "Client";
        await fetch(`${spaBase}/api/sms/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactId,
            body: `C'est parti${spaContact?.first_name ? " " + spaContact.first_name : ""}! 🌊 Ton entretien spa ${planLabel} est actif. On te texte pour planifier ta première visite. Bienvenue chez ALTAMAR!`,
          }),
        });

        const spaFranchise = spaContact?.franchise_id ?? "00000000-0000-0000-0000-000000000001";
        const { data: fr2 } = await supabaseAdmin.from("franchises").select("owner_phone").eq("id", spaFranchise).single();
        const { data: owner2 } = fr2?.owner_phone
          ? await supabaseAdmin.from("contacts").select("id").eq("phone", fr2.owner_phone).eq("franchise_id", spaFranchise).maybeSingle()
          : { data: null };
        if (owner2) {
          await fetch(`${spaBase}/api/sms/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contactId: owner2.id, body: `💰 ABONNEMENT SPA — ${clientName} vient de s'abonner: ${planLabel}. Planifie sa première visite!` }),
          });
        }
        await supabaseAdmin.from("automation_logs").insert({
          action: "spa_abonnement_actif",
          contact_id: contactId,
          status: "success",
          details: { plan: session.metadata.spa_plan },
          franchise_id: spaFranchise,
        });
        return NextResponse.json({ received: true });
      }

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
                body: `C'est officiel${contact?.first_name ? " " + contact.first_name : ""} — ta saison 2027 est RÉSERVÉE 🌊 Ton dépôt de ${payment?.amount ?? "?"}$ est confirmé (déduit de ta facture) et ton rabais de 10% est garanti. On se reparle au printemps pour l'ouverture. Merci! — l'équipe ALTAMAR`,
              }),
            });

            await supabaseAdmin.from("automation_logs").insert({
              action: "saison_2027_reserve",
              contact_id: contactId,
              status: "success",
              details: { amount: payment?.amount, payment_id: paymentId, plan: session.metadata?.plan ?? "comptant" },
              franchise_id: franchiseId,
            });

            // Plan 4 versements: créer les 4 paiements du solde (mai-août 2027).
            // La carte est sauvegardée (setup_future_usage) — customer/pm dans les notes du 1er versement.
            if (session.metadata?.plan === "4x") {
              const isEssentiel = (existingPayment?.notes ?? "").includes("ESSENTIEL");
              const isCreusee = (existingPayment?.notes ?? "").includes("creusée");
              const finalPrice = isEssentiel ? (isCreusee ? 1350 : 1170) : (isCreusee ? 1980 : 1620);
              const balance = finalPrice - Number(payment?.amount ?? 0);
              const per = Math.floor((balance / 4) * 100) / 100;
              const last = Math.round((balance - per * 3) * 100) / 100;
              const stripeRef = typeof session.payment_intent === "string" ? session.payment_intent : "";
              const { data: existing4x } = await supabaseAdmin
                .from("payments").select("id").eq("contact_id", contactId).ilike("notes", "%Versement 1/4 — saison 2027%").limit(1);
              if (!existing4x || existing4x.length === 0) {
                await supabaseAdmin.from("payments").insert([1, 2, 3, 4].map((n) => ({
                  contact_id: contactId,
                  amount: n === 4 ? last : per,
                  method: "stripe",
                  status: "en_attente",
                  due_date: `2027-0${4 + n}-01`,
                  notes: `Versement ${n}/4 — saison 2027 (solde après dépôt)${n === 1 && stripeRef ? ` — carte sauvegardée, PI: ${stripeRef}` : ""}`,
                  franchise_id: franchiseId,
                })));
                console.log(`[stripe-webhook] 4 versements créés (${per}$ x3 + ${last}$)`);
              }
            }
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
