export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getAppUrl } from "@/config/brand";
import { getCurrentCloser } from "@/lib/vendeur/server";
import { getPricingConfig, effectivePricing } from "@/lib/pricing";
import { firstNameFrom } from "@/lib/name";

/**
 * Création d'un paiement par un CLOSER.
 * Le closer choisit forfait + type de piscine + mode. Le MONTANT est calculé
 * ICI, côté serveur, depuis pricing_config — JAMAIS fourni par le client.
 * Aucune négociation possible: pas de champ montant.
 *
 * Crée une ligne payments (created_by, kind, plan, pool_type) et texte le lien
 * de paiement permanent /api/pay/{id} (dépôt/comptant = paiement unique,
 * mensuel = abonnement 12 versements — géré par /api/pay selon kind).
 */

const KINDS = ["depot", "saison_comptant", "mensuel"] as const;
const PLANS = ["signature", "essentiel"] as const;

export async function POST(req: NextRequest) {
  const closer = await getCurrentCloser();
  if (!closer) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { contactId, plan, poolType, kind } = await req.json();
  if (!KINDS.includes(kind) || !PLANS.includes(plan)) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }
  const pool = poolType === "creusée" ? "creusée" : poolType === "hors-terre" ? "hors-terre" : null;
  if (!pool) return NextResponse.json({ error: "Type de piscine requis (hors-terre ou creusée)" }, { status: 400 });

  // Ownership: le lead est-il assigné à CE closer ?
  const { data: lead } = await supabaseAdmin
    .from("contacts").select("id, first_name, assigned_to, franchise_id").eq("id", contactId).maybeSingle();
  if (!lead || lead.assigned_to !== closer.profile.id) {
    return NextResponse.json({ error: "Ce lead ne t'est pas assigné" }, { status: 403 });
  }

  // MONTANT calculé serveur (jamais le client)
  const cfg = await getPricingConfig();
  const eff = effectivePricing(cfg, plan, pool);
  const amount = kind === "depot" ? eff.deposit : kind === "mensuel" ? eff.monthly : eff.price;

  const modeLabel = kind === "depot" ? `Dépôt saison 2027 (${pool}, ${plan})`
    : kind === "mensuel" ? `Saison 2027 au mois — ${eff.monthly}$/mois ×12 (${pool}, ${plan})`
    : `Saison 2027 comptant — ${eff.price}$ (${pool}, ${plan})`;

  // Réutilise un paiement en_attente existant sur ce lead, sinon en crée un
  const { data: existing } = await supabaseAdmin
    .from("payments").select("id, status").eq("contact_id", contactId).eq("created_by", closer.profile.id).eq("status", "en_attente").maybeSingle();

  let paymentId: string;
  const row = {
    amount, method: "stripe" as const, status: "en_attente" as const,
    kind, plan, pool_type: pool, created_by: closer.profile.id, currency: "cad",
    notes: modeLabel, franchise_id: lead.franchise_id,
    due_date: cfg.promo.ends_at,
  };
  if (existing) {
    await supabaseAdmin.from("payments").update(row).eq("id", existing.id);
    paymentId = existing.id;
  } else {
    const { data: created, error } = await supabaseAdmin.from("payments").insert({ contact_id: contactId, ...row }).select("id").single();
    if (error || !created) return NextResponse.json({ error: error?.message || "Création du paiement échouée" }, { status: 500 });
    paymentId = created.id;
  }

  // Passer le pipeline en négociation→ (le lead est en train de closer)
  await supabaseAdmin.from("contacts").update({ pipeline_status: "negociation" }).eq("id", contactId).neq("pipeline_status", "client");

  // Texter le lien au client depuis le numéro ALTAMAR (même fil, marqué closer)
  const link = `${getAppUrl()}/api/pay/${paymentId}`;
  const prenom = firstNameFrom(lead.first_name) ? ` ${firstNameFrom(lead.first_name)}` : "";
  const smsBody = kind === "depot"
    ? `Salut${prenom}! Voici ton lien sécurisé pour réserver ta saison 2027 avec un dépôt de ${amount}$ (déduit de ta facture): ${link} 🌊`
    : kind === "mensuel"
      ? `Salut${prenom}! Voici ton lien pour démarrer ta saison 2027 au mois — ${amount}$/mois: ${link} 🌊`
      : `Salut${prenom}! Voici ton lien sécurisé pour payer ta saison 2027 comptant (${amount}$): ${link} 🌊`;
  await fetch(`${getAppUrl()}/api/sms/send`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contactId, body: smsBody, sentVia: "closer", sentByCloser: closer.profile.id }),
  }).catch(() => null);

  return NextResponse.json({ ok: true, paymentId, amount, link });
}
