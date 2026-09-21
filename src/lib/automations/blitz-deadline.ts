import { supabaseAdmin } from "@/lib/supabase";
import { getAppUrl } from "@/config/brand";
import { getPricingConfig, effectivePricing } from "@/lib/pricing";

/**
 * SÉQUENCE BLITZ FIN OCTOBRE — INACTIVE PAR DÉFAUT.
 *
 * Du 25 au 31 octobre, re-texte les leads piscine froids/silencieux/
 * refus-prix (JAMAIS les signés, les non fermes au blitz, les opt-outs).
 * 3 messages max par lead pour toute la séquence (un par date, gardé par
 * un log). Les places par secteur viennent de sector_capacity — si un
 * secteur n'a pas de capacité configurée, la phrase saute (rien d'inventé).
 *
 * ACTIVATION (manuelle par Thomas): settings key "blitz_deadline_enabled"
 * avec la valeur "on". Tant que la clé est absente ou ≠ "on", rien ne part.
 */

const POOL_SOURCES = ["meta_saison_2027", "site_chrono", "self_serve"];
const WAVES: Record<string, "w25" | "w29" | "w31"> = {
  "2026-10-25": "w25",
  "2026-10-29": "w29",
  "2026-10-31": "w31",
};

export function buildBlitzMessage(
  wave: "w25" | "w29" | "w31",
  pool: "hors-terre" | "creusée",
  prenom: string,
  places: number | null,
  m: Record<string, { avant: number; apres: number }>,
  lien: string,
): string {
  if (wave === "w25") {
    const placesLine = places != null && places > 0 ? ` Il reste ${places} place${places > 1 ? "s" : ""} dans ton secteur.` : "";
    const fr = (n: number) => String(n).replace(".", ",");
    return `Salut${prenom}! Dernière semaine pour le -10% sur ta saison 2027 🌊 Après samedi, le mensuel passe de ${fr(m[pool].avant)}$ à ${fr(m[pool].apres)}$/mois.${placesLine}`;
  }
  if (wave === "w29") {
    return `Petit rappel${prenom}: le -10% sur ta saison 2027 se termine samedi. Tu réserves en 2 minutes ici: ${lien} 🌊`;
  }
  return `Ce soir minuit, le prix remonte${prenom}. Après ça on pourra rien faire 🌊 ${lien}`;
}

async function sendSMS(contactId: string, body: string): Promise<boolean> {
  const res = await fetch(`${getAppUrl()}/api/sms/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contactId, body }),
  }).catch(() => null);
  return !!res?.ok;
}

export async function runBlitzDeadline(franchiseId: string, todayOverride?: string): Promise<string[]> {
  const out: string[] = [];

  // ── Interrupteur maître: OFF par défaut ──
  const { data: sw } = await supabaseAdmin
    .from("settings").select("value").eq("key", "blitz_deadline_enabled").maybeSingle();
  if ((sw?.value || "").trim() !== "on") return ["blitz inactif (settings blitz_deadline_enabled ≠ on)"];

  const today = todayOverride || new Date().toLocaleDateString("en-CA", { timeZone: "America/Montreal" });
  const wave = WAVES[today];
  if (!wave) return [`blitz actif mais pas de vague aujourd'hui (${today})`];

  // ── Prix (source unique) et places par secteur (vraies données) ──
  const cfg = await getPricingConfig();
  const now = new Date(today + "T12:00:00-04:00");
  const m = {
    "hors-terre": {
      avant: effectivePricing(cfg, "signature", "hors-terre", new Date("2026-10-01T12:00:00")).monthly,
      apres: effectivePricing(cfg, "signature", "hors-terre", new Date("2026-11-02T12:00:00")).monthly,
    },
    "creusée": {
      avant: effectivePricing(cfg, "signature", "creusée", new Date("2026-10-01T12:00:00")).monthly,
      apres: effectivePricing(cfg, "signature", "creusée", new Date("2026-11-02T12:00:00")).monthly,
    },
  };
  void now;

  const { data: capRow } = await supabaseAdmin
    .from("settings").select("value").eq("key", "sector_capacity").maybeSingle();
  const sectors: { nom: string; capacite: number }[] = capRow?.value ? JSON.parse(capRow.value) : [];
  const { data: signed } = await supabaseAdmin
    .from("contacts").select("city").eq("franchise_id", franchiseId).ilike("notes", "%RÉSERVÉ 2027%");
  const signedByCity: Record<string, number> = {};
  for (const c of signed || []) {
    const k = (c.city || "").trim().toLowerCase();
    if (k) signedByCity[k] = (signedByCity[k] || 0) + 1;
  }
  const placesFor = (city: string | null): number | null => {
    const s = sectors.find((x) => x.capacite > 0 && x.nom.toLowerCase() === (city || "").trim().toLowerCase());
    if (!s) return null;
    return Math.max(0, s.capacite - (signedByCity[s.nom.toLowerCase()] || 0));
  };

  // ── Cibles: leads piscine ouverts, froids/silencieux/refus-prix ──
  const { data: leads } = await supabaseAdmin
    .from("contacts")
    .select("id, first_name, city, pool_type, stage, notes, phone")
    .eq("franchise_id", franchiseId)
    .in("lead_source", POOL_SOURCES)
    .not("stage", "in", '("closé","complété")');

  for (const lead of leads || []) {
    const notes = lead.notes || "";
    if (!lead.phone?.startsWith("+")) continue;

    // Exclusions dures
    if (notes.includes("RÉSERVÉ 2027")) continue;                     // signé
    if (notes.includes("TAG:blitz-non")) continue;                    // non ferme au blitz
    if (notes.includes("OPT_OUT") || notes.includes("TAG:refus-desabonnement")) continue;
    if (/ABONNEMENT MENSUEL SAISON 2027 ACTIF/.test(notes)) continue;

    // Cibles: perdu à cause du prix OU silencieux OU froid (stage perdu inclus si refus-prix)
    const isRefusPrix = notes.includes("TAG:refus-prix") || notes.includes("SÉQUENCE REFUS");
    const isSilencieux = notes.includes("TAG:refus-silencieux");
    const isFroid = ["nouveau", "contacté", "soumission_envoyée"].includes(lead.stage);
    if (lead.stage === "perdu" && !isRefusPrix && !isSilencieux) continue; // perdu pour une autre raison → on respecte
    if (!isRefusPrix && !isSilencieux && !isFroid) continue;

    // Un message par vague max (et 3 max au total par construction)
    const actionKey = `blitz_deadline_${wave}`;
    const { data: already } = await supabaseAdmin
      .from("automation_logs").select("id")
      .eq("action", actionKey).eq("contact_id", lead.id).limit(1);
    if (already && already.length > 0) continue;

    const pool = lead.pool_type === "creusée" ? "creusée" : "hors-terre";
    const prenom = lead.first_name ? ` ${lead.first_name}` : "";
    const places = placesFor(lead.city);
    const lien = `${getAppUrl()}/reserver`;

    const msg = buildBlitzMessage(wave, pool, prenom, places, m, lien);

    const ok = await sendSMS(lead.id, msg);
    if (ok) {
      await supabaseAdmin.from("automation_logs").insert({
        action: actionKey,
        contact_id: lead.id,
        status: "success",
        details: { wave, pool, places },
        franchise_id: franchiseId,
      });
      out.push(`${wave}: ${lead.first_name || lead.phone} (${pool}${places != null ? `, ${places} places` : ""})`);
    } else {
      out.push(`⚠️ ${wave}: envoi échoué pour ${lead.first_name || lead.phone}`);
    }
  }

  if (out.length === 0) out.push(`${wave}: aucun lead ciblé`);
  return out;
}
