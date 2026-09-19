import { supabaseAdmin } from "@/lib/supabase";
import { getAppUrl } from "@/config/brand";
import Anthropic from "@anthropic-ai/sdk";

/**
 * FILE D'APPELS QUOTIDIENNE — leads campagne 2027 à appeler par Thomas.
 *
 * Chaque jour à 16h30 (Montréal), SMS au propriétaire listant les leads selon:
 *   (a) dépôt non payé 24h+ après un oui (lien envoyé, client a répondu, rien payé)
 *   (b) 3+ échanges sans close (toujours au stage nouveau)
 *   (c) aucune réponse à J+3 après les SMS d'ouverture
 *   (d) rappel programmé par Thomas (APPEL_PREVU:date arrivé à échéance)
 *
 * Thomas répond au SMS: VENDU n / RAPPEL n [date] / MORT n
 * → la fiche est mise à jour et la suite programmée. La file du jour est
 * stockée dans settings (call_queue, par franchise) pour mapper les numéros.
 */

interface QueueEntry {
  contactId: string;
  name: string;
  city: string | null;
  pool: string | null;
  readiness: string | null;
  reason: string;
  summary: string;
}

const READINESS_LABELS: Record<string, string> = {
  cette_semaine: "prêt cette semaine",
  veut_prix: "veut le prix",
  magasine: "magasine",
};

async function summarizeConversation(contactId: string, fallback: string): Promise<string> {
  const { data: msgs } = await supabaseAdmin
    .from("messages")
    .select("direction, body")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (!msgs || msgs.length === 0) return fallback;

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const convo = msgs.reverse().map((m) => `${m.direction === "inbound" ? "CLIENT" : "BOT"}: ${m.body.slice(0, 200)}`).join("\n");
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 60,
      thinking: { type: "disabled" },
      system: "Résume cette conversation SMS en UNE seule ligne de max 90 caractères, en français, pour préparer un appel de vente. Focus: où le client en est rendu et ce qui bloque. Pas de préambule.",
      messages: [{ role: "user", content: convo }],
    });
    const text = res.content[0]?.type === "text" ? res.content[0].text.trim() : "";
    return text.slice(0, 110) || fallback;
  } catch {
    return fallback;
  }
}

const todayMtl = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Montreal" });

export async function buildCallQueue(franchiseId: string): Promise<string[]> {
  const out: string[] = [];
  const today = todayMtl();

  // Anti-doublon quotidien
  const { data: dup } = await supabaseAdmin
    .from("automation_logs").select("id")
    .eq("action", `call_queue_${today}`).eq("franchise_id", franchiseId).limit(1);
  if (dup && dup.length) return ["file d'appels déjà envoyée aujourd'hui"];

  // Leads campagne 2027 encore ouverts
  const { data: leads } = await supabaseAdmin
    .from("contacts")
    .select("id, first_name, city, pool_type, stage, notes, created_at, phone")
    .eq("franchise_id", franchiseId)
    .in("lead_source", ["meta_saison_2027", "meta_spa"])
    .not("stage", "in", '("closé","perdu","complété")');

  if (!leads || leads.length === 0) return ["aucun lead 2027 ouvert"];

  const now = Date.now();
  const entries: QueueEntry[] = [];

  for (const lead of leads) {
    if (!lead.phone?.startsWith("+")) continue;
    const notesL = (lead.notes || "").toLowerCase();

    const [{ data: msgs }, { data: deposit }, { data: metaLog }] = await Promise.all([
      supabaseAdmin.from("messages").select("direction, body, created_at").eq("contact_id", lead.id).order("created_at"),
      supabaseAdmin.from("payments").select("id, status, created_at").eq("contact_id", lead.id).ilike("notes", "%Dépôt saison 2027%").maybeSingle(),
      supabaseAdmin.from("automation_logs").select("details").eq("action", "meta_saison_2027_lead").eq("contact_id", lead.id).maybeSingle(),
    ]);

    const inbound = (msgs || []).filter((m) => m.direction === "inbound");
    const readiness = (metaLog?.details as Record<string, string>)?.readiness ?? null;
    const linkSent = (msgs || []).find((m) => m.direction === "outbound" && m.body.includes("/api/pay/"));
    const created = new Date(lead.created_at).getTime();
    const daysSince = Math.floor((now - created) / 86400000);

    let reason: string | null = null;

    // (d) rappel programmé par Thomas: à échéance → prioritaire; dans le FUTUR →
    // le lead est suspendu (Thomas a explicitement reporté, aucune autre règle ne s'applique)
    const appelPrevu = (lead.notes || "").match(/APPEL_PREVU:(\d{4}-\d{2}-\d{2})/);
    if (appelPrevu && appelPrevu[1] > today) continue;
    if (appelPrevu && appelPrevu[1] <= today) {
      reason = `rappel prévu ${appelPrevu[1] === today ? "aujourd'hui" : "le " + appelPrevu[1]}`;
    }
    // (a) dépôt non payé 24h+ après un oui (piscine) / abonnement non complété (spa)
    else if (
      deposit && deposit.status === "en_attente" && linkSent && inbound.length > 0 &&
      now - new Date(linkSent.created_at).getTime() > 24 * 3600 * 1000
    ) {
      const h = Math.floor((now - new Date(linkSent.created_at).getTime()) / 3600000);
      reason = `dépôt impayé ${h >= 48 ? Math.floor(h / 24) + "j" : h + "h"} après le lien`;
    }
    else if ((() => {
      const spaLink = (msgs || []).find((m) => m.direction === "outbound" && m.body.includes("/api/spa/abonnement"));
      return spaLink && !notesL.includes("abonnement spa actif") && inbound.length > 0 &&
        now - new Date(spaLink.created_at).getTime() > 24 * 3600 * 1000;
    })()) {
      reason = "abonnement spa non complété 24h+ après le lien";
    }
    // (b) 3+ échanges sans close
    else if (inbound.length >= 3) {
      reason = `${inbound.length} échanges sans close`;
    }
    // (c) aucune réponse à J+3
    else if (inbound.length === 0 && daysSince >= 3) {
      reason = `aucune réponse depuis ${daysSince}j`;
    }
    // (d) haute valeur: creusée+spa, multi-piscines, commercial/chalet — signalé UNE fois
    else {
      const { data: leadFull } = await supabaseAdmin
        .from("contacts").select("pool_type, has_spa").eq("id", lead.id).single();
      const allText = notesL + " " + (msgs || []).filter((m) => m.direction === "inbound").map((m) => m.body.toLowerCase()).join(" ");
      const isHV = (leadFull?.pool_type === "creusée" && leadFull?.has_spa) ||
        /chalet|commercial|airbnb|deux piscines|2 piscines|plusieurs piscines/.test(allText);
      if (isHV && daysSince >= 1 && !notesL.includes("hv_signalé")) {
        reason = "💎 haute valeur — vaut un appel";
        await supabaseAdmin.from("contacts").update({ notes: (lead.notes || "") + "\nHV_SIGNALÉ" }).eq("id", lead.id);
      }
    }

    if (!reason) continue;

    const fallback = inbound.length === 0
      ? `Jamais répondu aux SMS d'ouverture (${daysSince}j).`
      : `Dernier message client: « ${inbound[inbound.length - 1].body.slice(0, 60)} »`;

    entries.push({
      contactId: lead.id,
      name: lead.first_name || lead.phone,
      city: lead.city,
      pool: lead.pool_type,
      readiness,
      reason,
      summary: await summarizeConversation(lead.id, fallback),
    });
    if (entries.length >= 8) break; // garder le SMS lisible
  }

  if (entries.length === 0) return ["file d'appels vide aujourd'hui — rien à signaler"];

  // Sauvegarder la file (mapping numéro → contact) pour les réponses par mot-clé
  // PK de settings = key seule → franchise scopée dans la clé
  await supabaseAdmin.from("settings").upsert(
    {
      key: `call_queue_${franchiseId}`,
      franchise_id: franchiseId,
      value: JSON.stringify({ date: today, contactIds: entries.map((e) => e.contactId) }),
    },
    { onConflict: "key" },
  );

  // Composer le SMS
  const dateLabel = new Date().toLocaleDateString("fr-CA", { timeZone: "America/Montreal", weekday: "long", day: "numeric", month: "long" });
  const lines = entries.map((e, i) => {
    const bits = [e.name, e.city, e.pool, e.readiness ? READINESS_LABELS[e.readiness] ?? e.readiness : null].filter(Boolean).join(", ");
    return `${i + 1}. ${bits} — [${e.reason}]\n   ${e.summary}`;
  });
  const body = `📞 FILE D'APPELS — ${dateLabel} (${entries.length})\n\n${lines.join("\n")}\n\nRéponds: VENDU 1 · RAPPEL 1 demain · MORT 1`.slice(0, 1500);

  // Envoyer au propriétaire
  const { data: fr } = await supabaseAdmin.from("franchises").select("owner_phone").eq("id", franchiseId).single();
  if (!fr?.owner_phone) return ["owner_phone manquant"];
  let { data: owner } = await supabaseAdmin
    .from("contacts").select("id").eq("phone", fr.owner_phone).eq("franchise_id", franchiseId).maybeSingle();
  if (!owner) {
    const { data: created } = await supabaseAdmin.from("contacts")
      .insert({ first_name: "Propriétaire", phone: fr.owner_phone, franchise_id: franchiseId, stage: "complété" })
      .select("id").single();
    owner = created;
  }
  if (!owner) return ["contact owner introuvable"];

  const res = await fetch(`${getAppUrl()}/api/sms/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contactId: owner.id, body }),
  });

  await supabaseAdmin.from("automation_logs").insert({
    action: `call_queue_${today}`,
    status: res.ok ? "success" : "failed",
    details: { count: entries.length, contacts: entries.map((e) => ({ id: e.contactId, reason: e.reason })) },
    franchise_id: franchiseId,
  });

  out.push(`file d'appels envoyée: ${entries.length} lead(s)`);
  return out;
}

// ─── RÉPONSES PAR MOT-CLÉ ────────────────────────────────────────────────────

const WEEKDAYS: Record<string, number> = {
  dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6,
};

function parseRappelDate(raw: string): string | null {
  const v = (raw || "").toLowerCase().trim();
  const base = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Montreal" }));
  if (!v || v === "demain") {
    base.setDate(base.getDate() + (v === "demain" ? 1 : 1));
    return base.toLocaleDateString("en-CA");
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const wd = Object.keys(WEEKDAYS).find((w) => v.startsWith(w));
  if (wd) {
    const target = WEEKDAYS[wd];
    let add = (target - base.getDay() + 7) % 7;
    if (add === 0) add = 7;
    base.setDate(base.getDate() + add);
    return base.toLocaleDateString("en-CA");
  }
  const dm = v.match(/^(\d{1,2})[\/-](\d{1,2})$/);
  if (dm) {
    const year = base.getFullYear();
    return `${year}-${String(parseInt(dm[2])).padStart(2, "0")}-${String(parseInt(dm[1])).padStart(2, "0")}`;
  }
  return null;
}

/** Détecte et traite une commande de file d'appels du propriétaire.
 *  Retourne true si le message était une commande (→ ne pas passer au bot). */
export async function handleCallQueueReply(
  franchiseId: string,
  ownerContactId: string,
  body: string,
): Promise<boolean> {
  const m = (body || "").trim().match(/^(VENDU|RAPPEL|MORT)\s*(\d+)?\s*(.*)$/i);
  if (!m) return false;

  const keyword = m[1].toUpperCase();
  const num = m[2] ? parseInt(m[2]) : 1;
  const rest = m[3] || "";

  const reply = async (text: string) => {
    await fetch(`${getAppUrl()}/api/sms/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: ownerContactId, body: text }),
    });
  };

  // Retrouver la file du jour
  const { data: setting } = await supabaseAdmin
    .from("settings").select("value").eq("key", `call_queue_${franchiseId}`).maybeSingle();
  if (!setting?.value) {
    await reply("CHLORE: aucune file d'appels active. La prochaine sort à 16h30.");
    return true;
  }
  const queue = JSON.parse(setting.value) as { date: string; contactIds: string[] };
  const contactId = queue.contactIds[num - 1];
  if (!contactId) {
    await reply(`CHLORE: numéro ${num} introuvable dans la file du ${queue.date} (${queue.contactIds.length} leads). Réponds ex: VENDU 1`);
    return true;
  }

  const { data: lead } = await supabaseAdmin
    .from("contacts").select("id, first_name, phone, notes").eq("id", contactId).maybeSingle();
  if (!lead) { await reply("CHLORE: lead introuvable."); return true; }
  const name = lead.first_name || lead.phone;
  const cleanNotes = (extra: string) =>
    ((lead.notes || "").split("\n").filter((l: string) => !l.startsWith("RELANCE_PREVUE:") && !l.startsWith("APPEL_PREVU:")).join("\n") + "\n" + extra).trim();

  if (keyword === "VENDU") {
    const { data: deposit } = await supabaseAdmin
      .from("payments").select("id, status, amount").eq("contact_id", contactId).ilike("notes", "%Dépôt saison 2027%").maybeSingle();
    await supabaseAdmin.from("contacts").update({
      stage: "closé",
      notes: cleanNotes(`✅ VENDU par téléphone le ${todayMtl()} (file d'appels).`),
    }).eq("id", contactId);
    const depNote = deposit && deposit.status === "en_attente"
      ? ` Dépôt de ${deposit.amount}$ encore en attente — le lien reste actif s'il paie par carte.`
      : "";
    await reply(`CHLORE ✅ ${name} marqué VENDU — stage closé, relances annulées.${depNote}`);
  } else if (keyword === "MORT") {
    await supabaseAdmin.from("contacts").update({
      stage: "perdu",
      notes: cleanNotes(`❌ Déclaré MORT après appel le ${todayMtl()} (file d'appels).`),
    }).eq("id", contactId);
    await reply(`CHLORE: ${name} marqué PERDU — relances annulées, il ne sera plus contacté.`);
  } else {
    // RAPPEL [date]
    const date = parseRappelDate(rest);
    if (!date) {
      await reply(`CHLORE: date pas comprise « ${rest} ». Essaie: RAPPEL ${num} demain · RAPPEL ${num} lundi · RAPPEL ${num} 2026-09-25`);
      return true;
    }
    await supabaseAdmin.from("contacts").update({
      notes: cleanNotes(`APPEL_PREVU:${date}\n📞 Rappel téléphonique demandé par Thomas le ${todayMtl()} pour le ${date}.`),
    }).eq("id", contactId);
    await reply(`CHLORE: rappel programmé — ${name} reviendra dans ta file d'appels du ${date}.`);
  }

  await supabaseAdmin.from("automation_logs").insert({
    action: "call_queue_reply",
    contact_id: contactId,
    status: "success",
    details: { keyword, num, rest },
    franchise_id: franchiseId,
  });
  return true;
}
