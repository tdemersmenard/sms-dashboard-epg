import { supabaseAdmin } from "@/lib/supabase";
import { BRAND, getAppUrl } from "@/config/brand";
import { normalizePhone } from "@/lib/utils";

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
}

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

/** Services à l'unité saison 2027 (CAS B — besoin ponctuel) */
export const UNIT_2027_PRICING = {
  ouverture: { "hors-terre": 180, "creusée": 200 },
  fermeture: { "hors-terre": 150, "creusée": 175 },
};

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
  const pricing = pool.key ? SAISON_2027_PRICING[pool.key] : null;
  log.push(`parse: ${fields.firstName ?? "(sans prénom)"} | ${phone} | ${fields.city ?? "?"} | piscine=${pool.label}${pool.isSpa ? " (SPA)" : ""} | readiness=${readiness}`);

  // ── Notes: offre + attribution + relances programmées selon readiness ──
  const noteLines = [
    `OFFRE SAISON 2027 [${OFFER_TAG}]: entretien saisonnier 2027 — 10% de rabais si dépôt de 10% avant le ${OFFER_DEADLINE}. Dépôt déduit de la facture.`,
    pricing
      ? `PRIX POUR CE CLIENT (${pool.label}): régulier ${pricing.fullPrice}$ → avec rabais ${pricing.finalPrice}$ (économie ${pricing.rebate}$). Dépôt requis: ${pricing.deposit}$.`
      : `PRIX À CONFIRMER PAR THOMAS (type: ${pool.label} — hors grille standard). NE PAS improviser de prix.`,
    `Attribution Meta: campagne "${attribution.campaign_name ?? attribution.campaign_id ?? "?"}", ad "${attribution.ad_name ?? attribution.ad_id ?? "?"}" (ad_id ${attribution.ad_id ?? "?"}, adset ${attribution.adset_id ?? "?"}, form ${attribution.form_id ?? "?"}, leadgen ${attribution.leadgen_id})`,
  ];
  if (readiness === "veut_prix") {
    noteLines.push(`RELANCE_PREVUE:${daysFromNow(2)}:As-tu eu le temps d'y réfléchir pour ta saison 2027? ${pricing ? `Le ${pricing.finalPrice}$ (-10%) est encore valide jusqu'au 1er novembre.` : "Je te prépare ton prix dès que tu veux."} Une question, peut-être?`);
  } else if (readiness === "magasine") {
    noteLines.push(`RELANCE_PREVUE:${daysFromNow(5)}:Toujours en train de comparer pour 2027? Prends ton temps — si tu as des questions sur ce qui est inclus, je suis là.`);
    noteLines.push(`RELANCE_PREVUE:${RELANCE_J3_DEADLINE}:Petit rappel: le rabais de 10% pour la saison 2027 se termine dans 3 jours (1er novembre). Après, c'est le prix régulier. Veux-tu que je te réserve ta place?`);
  }

  // ── Contact: find-or-create (même logique que le reste du système) ──
  let { data: contact } = await supabaseAdmin
    .from("contacts").select("id, first_name, notes").eq("phone", phone).eq("franchise_id", franchiseId).maybeSingle();

  const contactPayload = {
    ...(fields.firstName ? { first_name: fields.firstName } : {}),
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
        await supabaseAdmin.from("contacts").update({ notes: `${c2.notes}\nLIEN DÉPÔT STRIPE: ${depositUrl}` }).eq("id", contact.id);
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

  // ── SMS d'ouverture au lead, routé selon Q2 ──
  const rawFirst = (fields.firstName || "").trim().split(/\s+/)[0];
  const prenom = rawFirst ? ` ${rawFirst.charAt(0).toUpperCase()}${rawFirst.slice(1).toLowerCase()}` : "";
  const stackLine = pricing
    ? `Pour ta ${pool.label}: la saison 2027 complète est à ${pricing.fullPrice}$ — visite chaque semaine de mai à octobre, produits de balancement inclus, ouverture et fermeture comprises. Rien d'autre à payer.`
    : `Pour ta ${pool.label}, on te prépare un prix sur mesure — l'équipe te revient très vite (le -10% s'applique aussi).`;
  const offerLine = pricing
    ? `Et tu arrives au bon moment: avant le 1er novembre c'est ${pricing.finalPrice}$ (-10%) avec un dépôt de ${pricing.deposit}$ qui est déduit de ta facture.`
    : `Et le rabais de 10% avant le 1er novembre s'applique aussi à ta soumission.`;

  const openers: Record<string, string[]> = {
    cette_semaine: [
      `Salut${prenom}! C'est l'équipe ${BRAND.name} 🌊 ${stackLine}`,
      ...(pricing && depositUrl
        ? [`${offerLine} Comme tu es prêt à réserver, voici ton lien sécurisé pour le dépôt de ${pricing.deposit}$: ${depositUrl}`]
        : [`${offerLine} Dis-moi quand tu es prêt et je te réserve ta place!`]),
    ],
    veut_prix: [
      `Salut${prenom}! C'est l'équipe ${BRAND.name} 🌊 ${stackLine}`,
      `${offerLine} Petite question pour préparer ton dossier: en ce moment, tu l'entretiens toi-même ou t'avais quelqu'un?`,
    ],
    magasine: [
      `Salut${prenom}! C'est l'équipe ${BRAND.name} 🌊 ${stackLine}`,
      `${offerLine} Prends le temps de comparer — pas de pression. Petite question en passant: en ce moment, tu l'entretiens toi-même ou t'avais quelqu'un?`,
    ],
  };

  for (const msg of openers[readiness]) {
    const ok = await sendSMS(contact.id, msg);
    log.push(`${ok ? "✅ SMS lead envoyé" : "⚠️ SMS lead non parti (Twilio)"} (${readiness}) — contenu: « ${msg} »`);
    await new Promise((r) => setTimeout(r, 4000));
  }
  if (readiness === "veut_prix") log.push(`✅ relance programmée J+2 (${daysFromNow(2)})`);
  if (readiness === "magasine") log.push(`✅ relances programmées J+5 (${daysFromNow(5)}) et ${RELANCE_J3_DEADLINE} (J-3 deadline)`);

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
