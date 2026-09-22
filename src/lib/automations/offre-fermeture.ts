import { supabaseAdmin } from "@/lib/supabase";
import { getAppUrl } from "@/config/brand";
import { firstNameFrom } from "@/lib/name";

/**
 * RELANCE ONE-OFF « OFFRE DE FERMETURE À L'UNITÉ ».
 *
 * Tout lead piscine perdu entre septembre et novembre reçoit, ~24h après
 * son refus, une offre de fermeture ponctuelle (service à l'unité) — un
 * dernier point de contact utile avant l'hiver, sans pression sur la saison
 * complète. Une seule fois par lead (tag « offre_fermeture_envoyee »).
 *
 * Fenêtre saisonnière: on ne l'envoie que du 1er sept au 15 nov (après, la
 * saison des fermetures est finie, l'offre n'a plus de sens).
 */

// Prix de fermeture à l'unité pour CET automne (grille régulière courante)
const FERMETURE_PRICE: Record<string, number> = {
  "hors-terre": 200,
  "creusée": 250,
};

const POOL_SOURCES = ["meta_saison_2027", "site_chrono", "self_serve"];

async function sendSMS(contactId: string, body: string): Promise<boolean> {
  const res = await fetch(`${getAppUrl()}/api/sms/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contactId, body }),
  }).catch(() => null);
  return !!res?.ok;
}

export async function sendOffreFermeture(franchiseId: string, nowOverride?: Date): Promise<string[]> {
  const out: string[] = [];
  const now = nowOverride ?? new Date();

  // Fenêtre saisonnière 1er sept – 15 nov (heure Montréal)
  const mtlToday = now.toLocaleDateString("en-CA", { timeZone: "America/Montreal" });
  const [y, mo, d] = mtlToday.split("-").map(Number);
  const inSeason = (mo === 9) || (mo === 10) || (mo === 11 && d <= 15);
  if (!inSeason) return ["hors saison de fermeture (sept–15 nov) — aucune offre"];

  // Couvre-feu 21h-8h (cohérent avec les relances)
  const mtl = new Date(now.toLocaleString("en-US", { timeZone: "America/Montreal" }));
  const mtlMinutes = mtl.getHours() * 60 + mtl.getMinutes();
  if (mtlMinutes >= 21 * 60 || mtlMinutes < 8 * 60) return ["couvre-feu 21h-8h — aucune offre"];

  // Leads piscine PERDUS, pas déjà relancés, avec un type de piscine connu
  const { data: leads } = await supabaseAdmin
    .from("contacts")
    .select("id, first_name, pool_type, notes, phone")
    .eq("franchise_id", franchiseId)
    .eq("stage", "perdu")
    .in("lead_source", POOL_SOURCES);

  for (const lead of leads || []) {
    const notes = lead.notes || "";
    if (!lead.phone?.startsWith("+")) continue;
    if (notes.includes("offre_fermeture_envoyee")) continue;   // une seule fois
    if (notes.includes("RÉSERVÉ 2027")) continue;              // finalement signé
    if (notes.includes("OPT_OUT") || notes.includes("TAG:refus-desabonnement")) continue;

    // ~24h après le refus: on prend le dernier message échangé (stable, non
    // affecté par les edits de notes — contrairement à updated_at). Un lead
    // perdu sans message ne reçoit rien (rien à quoi rattacher le refus).
    const { data: lastMsg } = await supabaseAdmin
      .from("messages").select("created_at, direction")
      .eq("contact_id", lead.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!lastMsg) continue;
    const refusedAt = new Date(lastMsg.created_at).getTime();
    if (now.getTime() - refusedAt < 24 * 3600 * 1000) continue;
    // Si le dernier message vient du client, il attend une réponse — pas d'offre auto
    if (lastMsg.direction === "inbound") continue;

    const pool = lead.pool_type === "creusée" ? "creusée" : lead.pool_type === "hors-terre" ? "hors-terre" : null;
    const prix = pool ? FERMETURE_PRICE[pool] : null;
    const prenom = firstNameFrom(lead.first_name) ? ` ${firstNameFrom(lead.first_name)}` : "";

    const msg = prix
      ? `Salut${prenom}! Pas de saison complète cette année, c'est correct 🌊 Mais avant l'hiver, veux-tu qu'on s'occupe juste de fermer ta piscine? On la ferme dans les règles pour ${prix}$ — tu la retrouves nickel au printemps. Ça t'intéresse?`
      : `Salut${prenom}! Pas de saison complète cette année, c'est correct 🌊 Mais avant l'hiver, veux-tu qu'on s'occupe juste de fermer ta piscine comme il faut? Dis-moi si ça t'intéresse et je te sors le prix.`;

    const ok = await sendSMS(lead.id, msg);
    if (ok) {
      await supabaseAdmin.from("contacts").update({
        notes: `${notes.trim()}\noffre_fermeture_envoyee (${mtlToday})`.trim(),
      }).eq("id", lead.id);
      await supabaseAdmin.from("automation_logs").insert({
        action: "offre_fermeture_unite",
        contact_id: lead.id,
        status: "success",
        details: { pool, prix },
        franchise_id: franchiseId,
      });
      out.push(`offre fermeture: ${firstNameFrom(lead.first_name) || lead.phone}${prix ? ` (${prix}$)` : " (prix à sortir)"}`);
    } else {
      out.push(`⚠️ envoi échoué pour ${firstNameFrom(lead.first_name) || lead.phone}`);
    }
  }

  if (out.length === 0) out.push("aucun lead perdu à relancer pour la fermeture");
  return out;
}
