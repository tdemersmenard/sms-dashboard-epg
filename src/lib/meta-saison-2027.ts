import { supabaseAdmin } from "@/lib/supabase";
import { BRAND, getAppUrl } from "@/config/brand";
import { normalizePhone } from "@/lib/utils";
import { firstNameFrom } from "@/lib/name";

/**
 * Campagne Meta Leads « ALTAMAR — Saison 2027 Granby » — Instant Form custom.
 *
 * Offre preBF_10_10: 10% de rabais + dépôt de 10% (déduit de la facture),
 * deadline 1er novembre 2026.
 *
 * Q1 (type de piscine) → prix saison 2027:
 *   creusée      2 200$ → rabais 220$ → prix 1 980$ → dépôt 220$
 *   hors-terre   1 800$ → rabais 180$ → prix 1 620$ → dépôt 180$
 *   semi-creusée → PAS de prix auto (à confirmer par Thomas — hors grille fournie)
 *   spa          → PAS de prix auto (add-on, à évaluer)
 *
 * Q2 (readiness) → routage du SMS d'ouverture + follow-ups:
 *   cette_semaine → prix + lien de dépôt Stripe immédiat (2e SMS)
 *   veut_prix     → prix + inclus + close doux, relance J+2
 *   magasine      → transparence prix, zéro pression, relances J+5 et 29 oct (J-3 deadline)
 */

export const OFFER_TAG = "preBF_10_10";
export const OFFER_DEADLINE = "2026-11-01";
const RELANCE_J3_DEADLINE = "2026-10-29";

interface PoolPricing {
  label: string;
  fullPrice: number;
  rebate: number;
  finalPrice: number;
  deposit: number;
  /** Mensuel 12 mois (prix effectif / 12) — absent des vieilles constantes */
  monthly?: number;
}

// ⚠️ Valeurs par défaut seulement — la vérité vit dans settings.pricing_config
// (src/lib/pricing.ts). Utiliser loadSaisonPricing() partout où c'est possible.
export const SAISON_2027_PRICING: Record<string, PoolPricing> = {
  "creusée": { label: "creusée", fullPrice: 2200, rebate: 220, finalPrice: 1980, deposit: 220 },
  "hors-terre": { label: "hors-terre", fullPrice: 1800, rebate: 180, finalPrice: 1620, deposit: 180 },
};

/** Forfait ESSENTIEL — downsell UNIQUEMENT (séquence premier non, jamais offert en premier).
 *  Visite hebdo + tests/balancement; produits en sus; ouverture/fermeture en sus. */
export const ESSENTIEL_2027_PRICING: Record<string, PoolPricing> = {
  "creusée": { label: "creusée", fullPrice: 1500, rebate: 150, finalPrice: 1350, deposit: 150 },
  "hors-terre": { label: "hors-terre", fullPrice: 1300, rebate: 130, finalPrice: 1170, deposit: 130 },
};

/** Prix courants depuis la source unique pricing_config (fallback: constantes ci-dessus). */
export async function loadSaisonPricing(tier: "signature" | "essentiel" = "signature"): Promise<Record<string, PoolPricing>> {
  try {
    const { getPricingConfig, effectivePricing } = await import("@/lib/pricing");
    const cfg = await getPricingConfig();
    const out: Record<string, PoolPricing> = {};
    for (const pool of ["creusée", "hors-terre"] as const) {
      const e = effectivePricing(cfg, tier, pool);
      out[pool] = { label: pool, fullPrice: e.full, rebate: e.saving, finalPrice: e.price, deposit: e.deposit, monthly: e.monthly };
    }
    return out;
  } catch {
    return tier === "essentiel" ? ESSENTIEL_2027_PRICING : SAISON_2027_PRICING;
  }
}

/** Services à l'unité saison 2027 (CAS B — besoin ponctuel) */
export const UNIT_2027_PRICING = {
  ouverture: { "hors-terre": 180, "creusée": 200 },
  fermeture: { "hors-terre": 150, "creusée": 175 },
};

/** ENTRETIEN SPA — À L'ANNÉE (abonnement Stripe mensuel, engagement min. 3 mois).
 *  Inclus (les deux formules): chimie complète balancée, nettoyage du filtre,
 *  ligne d'eau, vérification équipement, rapport photo, produits inclus,
 *  changement d'eau complet 1x/année. Pas de dépôt, pas de contrat de saison. */
export const SPA_PRICING = {
  "2sem": { label: "aux 2 semaines", monthly: 160 },
  "mensuel": { label: "mensuel", monthly: 110 },
  /** Upsell UNIQUEMENT si le lead a piscine ET spa */
  "residence": { label: "Résidence Complète (piscine + spa)", monthly: 325 },
} as const;

/** Normalise la réponse Q1 du formulaire vers une clé de pricing (ou null si hors grille) */
export function normalizePoolType(raw: string): { key: string | null; isSpa: boolean; label: string } {
  const v = (raw || "").toLowerCase().trim();
  if (/spa|jacuzzi/.test(v)) return { key: null, isSpa: true, label: "spa" };
  if (/semi/.test(v)) return { key: null, isSpa: false, label: "semi-creusée" };
  if (/creus/.test(v)) return { key: "creusée", isSpa: false, label: "creusée" };
  if (/hors/.test(v)) return { key: "hors-terre", isSpa: false, label: "hors-terre" };
  return { key: null, isSpa: false, label: raw || "inconnu" };
}

/** Normalise la réponse Q2 */
export function normalizeReadiness(raw: string): "cette_semaine" | "veut_prix" | "magasine" {
  const v = (raw || "").toLowerCase();
  if (/semaine|maintenant|pr[eê]t|vite/.test(v)) return "cette_semaine";
  if (/prix|co[uû]t|combien|soumission/.test(v)) return "veut_prix";
  return "magasine";
}

export interface MetaLeadFields {
  firstName: string | null;
  phone: string | null;
  city: string | null;
  poolTypeRaw: string;
  readinessRaw: string;
  /** Question du form SPA (campagne entretien spa à l'année) */
  spaUsageRaw?: string;
}

export interface MetaAttribution {
  leadgen_id: string;
  ad_id: string | null;
  adset_id: string | null;
  campaign_id: string | null;
  form_id: string | null;
  ad_name: string | null;
  campaign_name: string | null;
}

/** Récupère le lead complet via l'API Graph (nécessite META_PAGE_ACCESS_TOKEN) */
export async function fetchMetaLead(leadgenId: string): Promise<{ fields: MetaLeadFields; attribution: MetaAttribution } | null> {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) {
    console.error("[meta-2027] META_PAGE_ACCESS_TOKEN manquant — impossible de récupérer le lead", leadgenId);
    return null;
  }

  const url = `https://graph.facebook.com/v21.0/${leadgenId}?fields=field_data,ad_id,adset_id,campaign_id,form_id,ad_name,campaign_name&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`[meta-2027] Graph API ${res.status} pour lead ${leadgenId}:`, (await res.text()).slice(0, 300));
    return null;
  }
  const data = await res.json();

  const fieldMap: Record<string, string> = {};
  for (const f of data.field_data || []) {
    fieldMap[(f.name || "").toLowerCase()] = Array.isArray(f.values) ? f.values[0] : String(f.values ?? "");
  }

  // Champs standards + questions custom (tolérant sur les noms de champs du form)
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const hit = Object.keys(fieldMap).find((fk) => fk.includes(k));
      if (hit && fieldMap[hit]) return fieldMap[hit];
    }
    return null;
  };

  return {
    fields: {
      firstName: pick("first_name", "prénom", "prenom", "full_name", "nom"),
      phone: pick("phone", "téléphone", "telephone"),
      city: pick("city", "ville"),
      poolTypeRaw: pick("piscine", "pool", "type") || "",
      readinessRaw: pick("readiness", "quand", "pr[êe]t", "moment", "d[ée]marrer", "commencer") || pick("q2") || "",
      spaUsageRaw: pick("spa_usage", "usage", "hiver", "ferme") || "",
    },
    attribution: {
      leadgen_id: leadgenId,
      ad_id: data.ad_id ?? null,
      adset_id: data.adset_id ?? null,
      campaign_id: data.campaign_id ?? null,
      form_id: data.form_id ?? null,
      ad_name: data.ad_name ?? null,
      campaign_name: data.campaign_name ?? null,
    },
  };
}

async function sendSMS(contactId: string, body: string) {
  const res = await fetch(`${getAppUrl()}/api/sms/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contactId, body }),
  });
  return res.ok;
}

async function notifyOwner(franchiseId: string, body: string) {
  const { data: fr } = await supabaseAdmin.from("franchises").select("owner_phone").eq("id", franchiseId).single();
  if (!fr?.owner_phone) return false;
  let { data: owner } = await supabaseAdmin
    .from("contacts").select("id").eq("phone", fr.owner_phone).eq("franchise_id", franchiseId).maybeSingle();
  if (!owner) {
    const { data: created } = await supabaseAdmin
      .from("contacts")
      .insert({ first_name: "Propriétaire", phone: fr.owner_phone, franchise_id: franchiseId, stage: "complété" })
      .select("id").single();
    owner = created;
  }
  if (!owner) return false;
  return sendSMS(owner.id, body);
}

const daysFromNow = (n: number) =>
  new Date(Date.now() + n * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Montreal" });

/**
 * Traite un lead Saison 2027: contact + attribution + dépôt + SMS Thomas + SMS d'ouverture.
 * Retourne un log détaillé de chaque étape (pour les tests et le debug).
 */
export async function processSaison2027Lead(
  fields: MetaLeadFields,
  attribution: MetaAttribution,
  franchiseId: string,
): Promise<string[]> {
  const log: string[] = [];
  const phone = fields.phone ? normalizePhone(fields.phone) : null;
  if (!phone || !phone.startsWith("+")) {
    log.push(`❌ téléphone invalide: "${fields.phone}" — lead non traité, notification owner`);
    await notifyOwner(franchiseId, `CHLORE ⚠️ Lead Meta 2027 reçu SANS téléphone valide (${fields.firstName ?? "?"}, ${fields.city ?? "?"}). Va voir dans Meta Ads Manager, leadgen ${attribution.leadgen_id}.`);
    return log;
  }

  const pool = normalizePoolType(fields.poolTypeRaw);
  const readiness = normalizeReadiness(fields.readinessRaw);
  const livePricing = await loadSaisonPricing("signature");
  const pricing = pool.key ? livePricing[pool.key] : null;
  log.push(`parse: ${fields.firstName ?? "(sans prénom)"} | ${phone} | ${fields.city ?? "?"} | piscine=${pool.label}${pool.isSpa ? " (SPA)" : ""} | readiness=${readiness}`);

  // ── Notes: offre + attribution + relances programmées selon readiness ──
  const noteLines = [
    `OFFRE SAISON 2027 [${OFFER_TAG}]: entretien saisonnier 2027 — 10% de rabais si dépôt de 10% avant le ${OFFER_DEADLINE}. Dépôt déduit de la facture.`,
    pricing
      ? `PRIX POUR CE CLIENT (${pool.label}): MENSUEL ${pricing.monthly}$/mois ×12 (option à mettre en avant) OU comptant ${pricing.finalPrice}$ +tx d'un coup = OPTION ÉCONOMIQUE, ~120$ de moins que le mensuel (régulier ${pricing.fullPrice}$, rabais pré-saison ${pricing.rebate}$). Dépôt saison: ${pricing.deposit}$ (au mensuel, le prélèvement 1 fait office de dépôt). CES PRIX SONT FERMES — aucun autre chiffre.`
      : `PRIX À CONFIRMER PAR THOMAS (type: ${pool.label} — hors grille standard). NE PAS improviser de prix.`,
    `Attribution Meta: campagne "${attribution.campaign_name ?? attribution.campaign_id ?? "?"}", ad "${attribution.ad_name ?? attribution.ad_id ?? "?"}" (ad_id ${attribution.ad_id ?? "?"}, adset ${attribution.adset_id ?? "?"}, form ${attribution.form_id ?? "?"}, leadgen ${attribution.leadgen_id})`,
  ];
  const monthlyStr = pricing ? `${pricing.monthly ?? Math.round((pricing.finalPrice / 12) * 100) / 100}$` : null;
  if (monthlyStr) {
    noteLines.push(`RELANCE_PREVUE:${daysFromNow(1)}:Juste pour être sûr que t'as vu: la saison complète revient à ${monthlyStr}/mois, tout inclus 🌊 Une question peut-être?`);
    noteLines.push(`RELANCE_PREVUE:${daysFromNow(3)}:Dernier petit suivi pour ta saison 2027 à ${monthlyStr}/mois — si c'est non c'est correct, dis-le moi et je te laisse tranquille. Si t'hésites encore, je suis là.`);
  } else if (readiness === "veut_prix") {
    noteLines.push(`RELANCE_PREVUE:${daysFromNow(2)}:As-tu eu le temps d'y réfléchir pour ta saison 2027? Je te prépare ton prix dès que tu veux. Une question, peut-être?`);
  }

  // ── Contact: find-or-create (même logique que le reste du système) ──
  let { data: contact } = await supabaseAdmin
    .from("contacts").select("id, first_name, notes").eq("phone", phone).eq("franchise_id", franchiseId).maybeSingle();

  const contactPayload = {
    ...(firstNameFrom(fields.firstName) ? { first_name: firstNameFrom(fields.firstName) } : {}),
    ...(fields.city ? { city: fields.city } : {}),
    ...(pool.key ? { pool_type: pool.key } : {}),
    ...(pool.isSpa ? { has_spa: true } : {}),
    lead_source: "meta_saison_2027",
    stage: "nouveau" as const,
  };

  if (contact) {
    const mergedNotes = [(contact.notes || "").trim(), ...noteLines].filter(Boolean).join("\n");
    await supabaseAdmin.from("contacts").update({ ...contactPayload, notes: mergedNotes }).eq("id", contact.id);
    log.push(`contact existant mis à jour: ${contact.id}`);
  } else {
    const { data: created, error } = await supabaseAdmin
      .from("contacts")
      .insert({ phone, franchise_id: franchiseId, notes: noteLines.join("\n"), ...contactPayload })
      .select("id, first_name")
      .single();
    if (error || !created) {
      log.push(`❌ création contact échouée: ${error?.message}`);
      return log;
    }
    contact = { ...created, notes: null };
    log.push(`✅ contact créé: ${created.id} (source meta_saison_2027, stage nouveau)`);
  }

  // ── Dépôt: paiement en_attente + lien de paiement permanent ──
  let depositUrl: string | null = null;
  if (pricing) {
    const { data: existingDeposit } = await supabaseAdmin
      .from("payments").select("id").eq("contact_id", contact.id).ilike("notes", "%Dépôt saison 2027%").limit(1);
    let paymentId = existingDeposit?.[0]?.id;
    if (!paymentId) {
      const { data: pay, error: payErr } = await supabaseAdmin
        .from("payments")
        .insert({
          contact_id: contact.id,
          amount: pricing.deposit,
          method: "stripe",
          status: "en_attente",
          due_date: OFFER_DEADLINE,
          notes: `Dépôt saison 2027 — déduit de la facture (${pool.label}, ${OFFER_TAG})`,
          franchise_id: franchiseId,
        })
        .select("id")
        .single();
      if (payErr || !pay) {
        log.push(`❌ création paiement dépôt échouée: ${payErr?.message}`);
      } else {
        paymentId = pay.id;
        log.push(`✅ dépôt ${pricing.deposit}$ créé (payment ${pay.id}, dû ${OFFER_DEADLINE})`);
      }
    } else {
      log.push(`dépôt déjà existant: ${paymentId}`);
    }
    if (paymentId) {
      depositUrl = `${getAppUrl()}/api/pay/${paymentId}`;
      // Le lien va aussi dans les notes pour que le bot puisse le repartager
      const { data: c2 } = await supabaseAdmin.from("contacts").select("notes").eq("id", contact.id).single();
      if (c2 && !(c2.notes || "").includes(depositUrl)) {
        await supabaseAdmin.from("contacts").update({ notes: `${c2.notes}\nLIEN DÉPÔT STRIPE: ${depositUrl}\nLIEN RÉSERVATION MENSUEL (au mois): ${getAppUrl()}/reserver?plan=mensuel\nLIEN RÉSERVATION SAISON (comptant ou 4 versements): ${getAppUrl()}/reserver?plan=saison` }).eq("id", contact.id);
      }
    }
  }

  // ── SMS à Thomas (immédiat) ──
  const readinessLabel = { cette_semaine: "prêt cette semaine 🔥", veut_prix: "veut le prix", magasine: "magasine" }[readiness];
  const thomasOk = await notifyOwner(
    franchiseId,
    `🔥 NOUVEAU LEAD 2027 — ${fields.firstName ?? phone}, ${fields.city ?? "ville ?"}, ${pool.label}${pool.isSpa ? " (spa)" : ""}, readiness: ${readinessLabel}. Ad: ${attribution.ad_name ?? attribution.ad_id ?? "?"}. ${pricing ? "CHLORE est dessus." : "⚠️ PRIX À CONFIRMER (hors grille) — CHLORE ne quotera pas tant que tu n'as pas mis le prix dans sa fiche."}`,
  );
  log.push(thomasOk ? "✅ SMS Thomas envoyé" : "⚠️ SMS Thomas non envoyé (owner_phone/contact manquant)");

  // ── SMS d'ouverture: le mensuel en vedette + question d'engagement ──
  const first = firstNameFrom(fields.firstName);
  const prenom = first ? ` ${first}` : "";

  const openerMsgs: string[] = pricing
    ? [
        `Salut${prenom}! C'est l'équipe ${BRAND.name} 🌊 Ta saison 2027 complète — visites chaque semaine, produits, ouverture, fermeture, rapport photo — c'est ${pricing.monthly}$/mois. Ou ${pricing.finalPrice}$ +tx d'un coup, l'option la plus économique (au lieu de ${pricing.fullPrice}$) si tu réserves avant le 1er novembre. Tu préfères au mois ou par saison?`,
      ]
    : [
        `Salut${prenom}! C'est l'équipe ${BRAND.name} 🌊 Pour ta ${pool.label}, on te prépare un prix sur mesure — l'équipe te revient très vite (le -10% avant le 1er novembre s'applique aussi).`,
      ];

  for (const msg of openerMsgs) {
    const ok = await sendSMS(contact.id, msg);
    log.push(`${ok ? "✅ SMS lead envoyé" : "⚠️ SMS lead non parti (Twilio)"} (${readiness}) — contenu: « ${msg} »`);
  }
  if (monthlyStr) log.push(`✅ relances programmées J+1 (${daysFromNow(1)}) et J+3 (${daysFromNow(3)}) — mensuel en avant`);


  await supabaseAdmin.from("automation_logs").insert({
    action: "meta_saison_2027_lead",
    contact_id: contact.id,
    status: "success",
    details: { readiness, pool: pool.label, pricing: pricing ?? "à confirmer", attribution },
    franchise_id: franchiseId,
  });
  log.push("✅ lead loggé (automation_logs: meta_saison_2027_lead)");

  return log;
}
