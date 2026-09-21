import { supabaseAdmin } from "@/lib/supabase";
import { GRANBY_FRANCHISE_ID } from "@/lib/franchise";

const SEASON_START = "2026-05-01";

export interface SiteStats {
  visites_saison: number | null;
  rapports_photo_envoyes: number | null;
  temps_reponse_moyen_s: number | null;
  secteurs: { nom: string; places_restantes: number; capacite: number }[];
}

/**
 * Stats publiques du tableau de bord live — VRAIES données, AUCUNE donnée
 * personnelle. Une stat non calculable est retournée null: le front n'affiche
 * pas la tuile plutôt que d'inventer un chiffre.
 */
export async function computeSiteStats(): Promise<SiteStats> {
  const out: SiteStats = { visites_saison: null, rapports_photo_envoyes: null, temps_reponse_moyen_s: null, secteurs: [] };

  // ── Visites d'entretien complétées cette saison ──
  try {
    const { count } = await supabaseAdmin
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("franchise_id", GRANBY_FRANCHISE_ID)
      .eq("job_type", "entretien")
      .eq("status", "complété")
      .gte("scheduled_date", SEASON_START);
    if (count && count > 0) out.visites_saison = count;
  } catch { /* tuile omise */ }

  // ── Temps de réponse moyen aux textos (7 derniers jours) ──
  try {
    const since = new Date(Date.now() - 7 * 86400e3).toISOString();
    const { data: msgs } = await supabaseAdmin
      .from("messages")
      .select("contact_id, direction, created_at")
      .eq("franchise_id", GRANBY_FRANCHISE_ID)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(4000);

    const lastInbound: Record<string, number> = {};
    const deltas: number[] = [];
    for (const m of msgs || []) {
      if (m.direction === "inbound") {
        lastInbound[m.contact_id] = new Date(m.created_at).getTime();
      } else if (lastInbound[m.contact_id]) {
        const d = (new Date(m.created_at).getTime() - lastInbound[m.contact_id]) / 1000;
        // On ne compte que les réponses <10 min (au-delà = reprise humaine différée)
        if (d > 0 && d < 600) deltas.push(d);
        delete lastInbound[m.contact_id];
      }
    }
    if (deltas.length >= 5) {
      out.temps_reponse_moyen_s = Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 10) / 10;
    }
  } catch { /* tuile omise */ }

  // ── Places restantes par secteur (capacité éditable - contrats 2027 signés) ──
  try {
    const { data: capRow } = await supabaseAdmin
      .from("settings").select("value").eq("key", "sector_capacity").maybeSingle();
    const sectors: { nom: string; capacite: number }[] = capRow?.value ? JSON.parse(capRow.value) : [];

    const withCapacity = sectors.filter((s) => s.capacite > 0);
    if (withCapacity.length > 0) {
      const { data: signed } = await supabaseAdmin
        .from("contacts")
        .select("city")
        .eq("franchise_id", GRANBY_FRANCHISE_ID)
        .ilike("notes", "%RÉSERVÉ 2027%");
      const byCity: Record<string, number> = {};
      for (const c of signed || []) {
        const k = (c.city || "").trim().toLowerCase();
        if (k) byCity[k] = (byCity[k] || 0) + 1;
      }
      out.secteurs = withCapacity.map((s) => ({
        nom: s.nom,
        capacite: s.capacite,
        places_restantes: Math.max(0, s.capacite - (byCity[s.nom.toLowerCase()] || 0)),
      }));
    }
  } catch { /* section omise */ }

  return out;
}
