import { supabaseAdmin } from "@/lib/supabase";
import { getAppUrl } from "@/config/brand";

/**
 * Séquence « premier non » — parties automatisées (le reste vit dans le prompt, règle 25):
 *
 * 1. REFUS SILENCIEUX (CAS D): question de sortie posée il y a 48h+, aucune
 *    réponse depuis → TAG:refus-silencieux + UNE relance à J-3 du 1er novembre.
 * 2. NETTOYAGE: les leads taggés refus final (prix-final, vente-maison, etc.)
 *    ne doivent plus recevoir les relances J+2/J+5/J-3 programmées avant leur refus.
 * 3. RAPPORT HEBDO (dimanche 17h): décompte des refus par raison → SMS au owner.
 */

const J3_DEADLINE = "2026-10-29";
const todayMtl = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Montreal" });

async function notifyOwner(franchiseId: string, body: string): Promise<boolean> {
  const { data: fr } = await supabaseAdmin.from("franchises").select("owner_phone").eq("id", franchiseId).single();
  if (!fr?.owner_phone) return false;
  const { data: owner } = await supabaseAdmin
    .from("contacts").select("id").eq("phone", fr.owner_phone).eq("franchise_id", franchiseId).maybeSingle();
  if (!owner) return false;
  const res = await fetch(`${getAppUrl()}/api/sms/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contactId: owner.id, body }),
  });
  return res.ok;
}

export async function sweepRefus(franchiseId: string): Promise<string[]> {
  const out: string[] = [];
  const now = Date.now();

  const { data: leads } = await supabaseAdmin
    .from("contacts")
    .select("id, first_name, notes, stage")
    .eq("franchise_id", franchiseId)
    .eq("lead_source", "meta_saison_2027")
    .ilike("notes", "%SÉQUENCE REFUS%");

  for (const lead of leads || []) {
    const notes = lead.notes || "";
    const hasTag = /TAG:refus-|TAG:upsell-/.test(notes);
    const hasRelances = notes.includes("RELANCE_PREVUE:");

    // ── 2. Refus final taggé → retirer les relances restantes ──
    if (hasTag && !notes.includes("TAG:refus-silencieux") && hasRelances) {
      const cleaned = notes.split("\n").filter((l: string) => !l.startsWith("RELANCE_PREVUE:")).join("\n");
      await supabaseAdmin.from("contacts").update({ notes: cleaned }).eq("id", lead.id);
      out.push(`relances retirées (refus final): ${lead.first_name ?? lead.id.slice(0, 8)}`);
      continue;
    }
    if (hasTag) continue;

    // ── 1. Refus silencieux: question posée 48h+, aucun inbound depuis ──
    // Le marqueur n'a pas d'heure — on prend la date du message contenant la question.
    const { data: exitMsg } = await supabaseAdmin
      .from("messages")
      .select("created_at")
      .eq("contact_id", lead.id)
      .eq("direction", "outbound")
      .ilike("body", "%pour que je m'améliore%")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!exitMsg) continue;
    const askedAt = new Date(exitMsg.created_at).getTime();
    if (now - askedAt < 48 * 3600 * 1000) continue;

    const { data: reply } = await supabaseAdmin
      .from("messages")
      .select("id")
      .eq("contact_id", lead.id)
      .eq("direction", "inbound")
      .gt("created_at", exitMsg.created_at)
      .limit(1)
      .maybeSingle();
    if (reply) continue; // il a répondu — le bot gère

    // Tagger + remplacer toutes les relances par LA relance unique J-3
    const kept = notes.split("\n").filter((l: string) => !l.startsWith("RELANCE_PREVUE:"));
    const prenom = lead.first_name ? ` ${lead.first_name}` : "";
    kept.push("TAG:refus-silencieux");
    kept.push(`RELANCE_PREVUE:${J3_DEADLINE}:Dernier rappel avant que l'offre finisse le 1er novembre: ta saison 2027 à -10% et ta place garantie. Après, les prix remontent. Toujours non? Aucun trouble${prenom}, je ne te relancerai plus. 🌊`);
    await supabaseAdmin.from("contacts").update({ notes: kept.join("\n") }).eq("id", lead.id);
    await supabaseAdmin.from("automation_logs").insert({
      action: "refus_silencieux_tag",
      contact_id: lead.id,
      status: "success",
      details: { relance: J3_DEADLINE },
      franchise_id: franchiseId,
    });
    out.push(`refus silencieux taggé + relance ${J3_DEADLINE}: ${lead.first_name ?? lead.id.slice(0, 8)}`);
  }

  return out;
}

/** Rapport hebdomadaire des raisons de refus (dimanche 17h) */
export async function sendRefusWeeklyReport(franchiseId: string): Promise<string[]> {
  const today = todayMtl();
  const { data: dup } = await supabaseAdmin
    .from("automation_logs").select("id")
    .eq("action", `refus_report_${today}`).eq("franchise_id", franchiseId).limit(1);
  if (dup && dup.length) return ["rapport refus déjà envoyé"];

  const { data: leads } = await supabaseAdmin
    .from("contacts")
    .select("id, notes")
    .eq("franchise_id", franchiseId)
    .eq("lead_source", "meta_saison_2027")
    .ilike("notes", "%TAG:%");

  const counts: Record<string, number> = {};
  let total = 0;
  for (const lead of leads || []) {
    const tags = (lead.notes || "").match(/TAG:[a-z0-9-]+/g) || [];
    for (const t of Array.from(new Set(tags))) {
      const key = t.replace("TAG:", "");
      counts[key] = (counts[key] || 0) + 1;
      total++;
    }
  }

  if (total === 0) return ["aucun tag de refus cette semaine"];

  const lines = Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([reason, n]) => `• ${reason}: ${n}`);
  const body = `📊 RAPPORT REFUS 2027 — semaine du ${today}\n${lines.join("\n")}\nTotal leads taggés: ${(leads || []).length}`;

  const ok = await notifyOwner(franchiseId, body);
  await supabaseAdmin.from("automation_logs").insert({
    action: `refus_report_${today}`,
    status: ok ? "success" : "failed",
    details: counts,
    franchise_id: franchiseId,
  });
  return [`rapport refus envoyé (${Object.keys(counts).length} raisons)`];
}
