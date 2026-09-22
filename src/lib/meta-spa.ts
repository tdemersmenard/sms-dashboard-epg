import { supabaseAdmin } from "@/lib/supabase";
import { BRAND, getAppUrl } from "@/config/brand";
import { normalizePhone } from "@/lib/utils";
import { firstNameFrom } from "@/lib/name";
import { SPA_PRICING } from "@/lib/meta-saison-2027";
import type { MetaAttribution } from "@/lib/meta-saison-2027";

/**
 * Campagne Meta ENTRETIEN SPA À L'ANNÉE — flow distinct du flow piscine.
 *
 * MSG 1 (auto): merci + reprise de SA réponse (ferme l'hiver → angle bris;
 * à l'année → angle chimie prise en charge) + question de situation
 * (places/âge du spa). JAMAIS de prix ni de close au message 1.
 * MSG 2+ : le bot (règle 26 du prompt) présente la formule qui matche,
 * avec le stack de valeur, et propose le start.
 */

export interface SpaLeadFields {
  firstName: string | null;
  phone: string | null;
  city: string | null;
  /** Réponse du form: ferme l'hiver vs roule à l'année */
  usageRaw: string;
}

export function normalizeSpaUsage(raw: string): "hiver" | "annee" | "inconnu" {
  const v = (raw || "").toLowerCase();
  if (/ferme|hiver|hivern|saisonn/.test(v)) return "hiver";
  if (/ann[ée]e|toute|12 mois|continu|toujours/.test(v)) return "annee";
  return "inconnu";
}

async function sendSMS(contactId: string, body: string) {
  const res = await fetch(`${getAppUrl()}/api/sms/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contactId, body }),
  });
  return res.ok;
}

async function notifyOwner(franchiseId: string, body: string): Promise<boolean> {
  const { data: fr } = await supabaseAdmin.from("franchises").select("owner_phone").eq("id", franchiseId).single();
  if (!fr?.owner_phone) return false;
  let { data: owner } = await supabaseAdmin
    .from("contacts").select("id").eq("phone", fr.owner_phone).eq("franchise_id", franchiseId).maybeSingle();
  if (!owner) {
    const { data: created } = await supabaseAdmin.from("contacts")
      .insert({ first_name: "Propriétaire", phone: fr.owner_phone, franchise_id: franchiseId, stage: "complété" })
      .select("id").single();
    owner = created;
  }
  if (!owner) return false;
  return sendSMS(owner.id, body);
}

export async function processSpaLead(
  fields: SpaLeadFields,
  attribution: MetaAttribution,
  franchiseId: string,
): Promise<string[]> {
  const log: string[] = [];
  const phone = fields.phone ? normalizePhone(fields.phone) : null;
  if (!phone || !phone.startsWith("+")) {
    log.push(`❌ téléphone invalide: "${fields.phone}"`);
    await notifyOwner(franchiseId, `CHLORE ⚠️ Lead SPA reçu SANS téléphone valide (${fields.firstName ?? "?"}, ${fields.city ?? "?"}). Leadgen ${attribution.leadgen_id} dans Meta Ads Manager.`);
    return log;
  }

  const usage = normalizeSpaUsage(fields.usageRaw);
  log.push(`parse spa: ${fields.firstName ?? "(sans prénom)"} | ${phone} | ${fields.city ?? "?"} | usage=${usage}`);

  // ── Contact existant déjà contacté par texto? → PAS de double-pitch auto ──
  let { data: contact } = await supabaseAdmin
    .from("contacts").select("id, first_name, notes, lead_source")
    .eq("phone", phone).eq("franchise_id", franchiseId).maybeSingle();

  if (contact) {
    const { data: prior } = await supabaseAdmin
      .from("messages").select("id").eq("contact_id", contact.id).limit(1);
    if (prior && prior.length > 0) {
      await supabaseAdmin.from("contacts").update({
        has_spa: true,
        notes: `${(contact.notes || "").trim()}\nLEAD SPA (${new Date().toLocaleDateString("en-CA", { timeZone: "America/Montreal" })}): a rempli le form spa (usage: ${usage}) mais DÉJÀ en conversation — pas de pitch auto pour éviter le doublon.`.trim(),
      }).eq("id", contact.id);
      await notifyOwner(franchiseId, `CHLORE 💡 ${contact.first_name ?? phone} (déjà dans tes conversations) vient de remplir le form SPA. Pas de SMS auto envoyé — reprends le fil toi-même ou dis au bot de continuer.`);
      log.push("contact déjà en conversation → pas de MSG1 auto, owner notifié");
      return log;
    }
  }

  const subs2sem = `${getAppUrl()}/api/spa/abonnement/__CID__?plan=2sem`;
  const subsMensuel = `${getAppUrl()}/api/spa/abonnement/__CID__?plan=mensuel`;

  const usageNote = usage === "hiver"
    ? "Ferme son spa l'hiver (angle: la majorité des bris arrivent aux spas mal fermés/mal rouverts — l'entretien à l'année évite ça)."
    : usage === "annee"
      ? "Roule son spa à l'année (angle: on prend la chimie en charge au complet)."
      : "Usage inconnu — à clarifier en conversation.";

  const noteLines = [
    `LEAD SPA — ENTRETIEN À L'ANNÉE [meta_spa]: ${usageNote}`,
    `PRIX SPA (abonnement mensuel Stripe, engagement min. 3 mois, AUCUN dépôt): aux 2 semaines ${SPA_PRICING["2sem"].monthly}$/mois; mensuel ${SPA_PRICING["mensuel"].monthly}$/mois. Inclus (les deux): chimie complète balancée, nettoyage du filtre, ligne d'eau, vérification équipement, rapport photo chaque visite, produits inclus, changement d'eau complet 1x/année.`,
    `Attribution Meta: campagne "${attribution.campaign_name ?? "?"}", ad "${attribution.ad_name ?? "?"}" (leadgen ${attribution.leadgen_id})`,
  ];

  const contactPayload = {
    ...(firstNameFrom(fields.firstName) ? { first_name: firstNameFrom(fields.firstName) } : {}),
    ...(fields.city ? { city: fields.city } : {}),
    has_spa: true,
    lead_source: "meta_spa",
    stage: "nouveau" as const,
  };

  if (contact) {
    await supabaseAdmin.from("contacts").update({
      ...contactPayload,
      notes: [(contact.notes || "").trim(), ...noteLines].filter(Boolean).join("\n"),
    }).eq("id", contact.id);
    log.push(`contact existant (jamais contacté) mis à jour: ${contact.id}`);
  } else {
    const { data: created, error } = await supabaseAdmin
      .from("contacts")
      .insert({ phone, franchise_id: franchiseId, notes: noteLines.join("\n"), ...contactPayload })
      .select("id, first_name")
      .single();
    if (error || !created) { log.push(`❌ création contact: ${error?.message}`); return log; }
    contact = { id: created.id, first_name: created.first_name, notes: null, lead_source: "meta_spa" };
    log.push(`✅ contact créé: ${created.id} (source meta_spa)`);
  }

  // Liens d'abonnement dans les notes (le bot les partage sur accord — règle 26)
  const { data: cNotes } = await supabaseAdmin.from("contacts").select("notes").eq("id", contact.id).single();
  await supabaseAdmin.from("contacts").update({
    notes: `${cNotes?.notes ?? ""}\nLIEN ABONNEMENT SPA 2SEM: ${subs2sem.replace("__CID__", contact.id)}\nLIEN ABONNEMENT SPA MENSUEL: ${subsMensuel.replace("__CID__", contact.id)}`.trim(),
  }).eq("id", contact.id);

  // ── SMS Thomas ──
  const usageLabel = { hiver: "ferme l'hiver", annee: "à l'année", inconnu: "usage ?" }[usage];
  const ok = await notifyOwner(
    franchiseId,
    `🛁 NOUVEAU LEAD SPA — ${fields.firstName ?? phone}, ${fields.city ?? "ville ?"}, ${usageLabel}. Ad: ${attribution.ad_name ?? "?"}. CHLORE est dessus.`,
  );
  log.push(ok ? "✅ SMS Thomas envoyé" : "⚠️ SMS Thomas non envoyé");

  // ── MSG 1: merci + reprise de sa réponse + question de situation. AUCUN prix. ──
  const first = firstNameFrom(fields.firstName);
  const prenom = first ? ` ${first}` : "";
  const angle = usage === "hiver"
    ? "Tu fermes ton spa l'hiver — justement, la majorité des bris arrivent aux spas mal fermés ou mal rouverts."
    : usage === "annee"
      ? "Tu le roules à l'année — parfait, on prend la chimie en charge au complet."
      : "On s'occupe de tout, chimie comprise.";
  const msg1 = `Salut${prenom}! C'est l'équipe ${BRAND.name} 🌊 Merci pour ta demande! ${angle} Petite question pour ton dossier: ton spa a combien de places, et il date de quand?`;
  const sent = await sendSMS(contact.id, msg1);
  log.push(`${sent ? "✅ MSG1 envoyé" : "⚠️ MSG1 non parti (Twilio)"} — contenu: « ${msg1} »`);

  await supabaseAdmin.from("automation_logs").insert({
    action: "meta_spa_lead",
    contact_id: contact.id,
    status: "success",
    details: { usage, attribution },
    franchise_id: franchiseId,
  });
  log.push("✅ lead loggé (meta_spa_lead)");
  return log;
}
