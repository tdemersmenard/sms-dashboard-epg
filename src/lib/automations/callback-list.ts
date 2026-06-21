import { supabaseAdmin } from "@/lib/supabase";
import { getOwnerContactId, getFranchiseOwner } from "@/lib/automations/helpers";

const ENTRETIEN_KEYWORDS = [
  "entretien", "hebdomadaire", "chaque semaine", "aux 2 semaines",
  "saisonnier", "saison", "forfait",
];

const REFUSAL_KEYWORDS = [
  "pas intéressé", "pas interesse", "non merci", "laissez faire",
  "trouvé ailleurs", "trouve ailleurs", "stop", "arrêtez", "arretez",
  "pas besoin", "no merci", "no thanks",
];

const CLOSED_STAGES = ["closé", "planifié", "complété", "perdu"];

export async function scanCallbackLeads(franchiseId: string): Promise<string[]> {
  const logs: string[] = [];
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  let candidates: Array<{
    id: string;
    first_name: string;
    last_name: string | null;
    phone: string;
    stage: string | null;
    services: string[] | null;
    callback_status: string | null;
    created_at: string;
  }> = [];

  try {
    const { data, error } = await supabaseAdmin
      .from("contacts")
      .select("id, first_name, last_name, phone, stage, services, callback_status, created_at")
      .not("phone", "is", null)
      .is("callback_status", null)
      .lte("created_at", threeDaysAgo)
      .eq("franchise_id", franchiseId);

    if (error) {
      logs.push(`[callback-scan] Erreur: ${error.message}`);
      return logs;
    }
    candidates = (data || []).filter(
      c => !CLOSED_STAGES.includes(c.stage ?? "")
    );
  } catch (err) {
    logs.push(`[callback-scan] Exception: ${String(err)}`);
    return logs;
  }

  for (const contact of candidates) {
    // At least 1 inbound message (client showed real interest)
    const { data: inboundMsgs } = await supabaseAdmin
      .from("messages")
      .select("body, created_at")
      .eq("contact_id", contact.id)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(15);

    if (!inboundMsgs || inboundMsgs.length === 0) continue;

    // Check if last inbound message is an explicit refusal
    const lastMsgBody = inboundMsgs[0].body?.toLowerCase() ?? "";
    if (REFUSAL_KEYWORDS.some(k => lastMsgBody.includes(k))) continue;

    // Check entretien interest: via services field OR message content
    const services = contact.services ?? [];
    const hasEntretienService = services.some(s =>
      s.toLowerCase().includes("entretien")
    );
    const allMsgText = inboundMsgs.map(m => m.body?.toLowerCase() ?? "").join(" ");
    const mentionsEntretien = ENTRETIEN_KEYWORDS.some(k => allMsgText.includes(k));

    if (!hasEntretienService && !mentionsEntretien) continue;

    // Mark as a_rappeler
    const { error: updateErr } = await supabaseAdmin
      .from("contacts")
      .update({
        callback_status: "a_rappeler",
        callback_added_at: new Date().toISOString(),
      })
      .eq("id", contact.id);

    if (updateErr) {
      logs.push(`[callback-scan] Erreur update ${contact.first_name}: ${updateErr.message}`);
    } else {
      logs.push(`${contact.first_name} ${contact.last_name ?? ""} → liste de rappel`);
    }
  }

  if (logs.length === 0) logs.push("Aucun nouveau lead à rappeler");
  return logs;
}

export async function sendCallbackRecap(franchiseId: string): Promise<string> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";
  const today = new Date().toISOString().split("T")[0];

  const franchise = await getFranchiseOwner(franchiseId);
  if (!franchise?.owner_phone) return "Pas de numéro de notification configuré";

  // Anti-doublon: envoyer max 1 fois par jour par franchise
  const { data: alreadySent } = await supabaseAdmin
    .from("automation_logs")
    .select("id")
    .eq("action", `callback_recap_${today}`)
    .eq("franchise_id", franchiseId)
    .limit(1);

  if (alreadySent && alreadySent.length > 0) return "Récap déjà envoyé aujourd'hui";

  // Leads à rappeler
  let leads: Array<{ first_name: string; last_name: string | null; phone: string }> = [];
  try {
    const { data, error } = await supabaseAdmin
      .from("contacts")
      .select("first_name, last_name, phone")
      .eq("callback_status", "a_rappeler")
      .eq("franchise_id", franchiseId)
      .order("callback_added_at", { ascending: true });

    if (error) return `[callback-recap] Erreur: ${error.message}`;
    leads = data ?? [];
  } catch {
    return "[callback-recap] Exception lors de la lecture";
  }

  if (leads.length === 0) return "Aucun lead à rappeler — pas de SMS envoyé";

  const listText = leads
    .slice(0, 10)
    .map(l => `• ${l.first_name} ${l.last_name ?? ""} — ${l.phone}`)
    .join("\n");
  const extra = leads.length > 10 ? `\n... et ${leads.length - 10} autres.` : "";
  const msg = `${leads.length} lead${leads.length > 1 ? "s" : ""} entretien à rappeler:\n${listText}${extra}\n\n${baseUrl}/${franchise.slug}/a-rappeler`;

  const ownerContactId = await getOwnerContactId(franchiseId, franchise.owner_phone);
  if (!ownerContactId) return "Contact propriétaire introuvable";

  await fetch(`${baseUrl}/api/sms/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contactId: ownerContactId, body: msg }),
  });

  await supabaseAdmin.from("automation_logs").insert({
    action: `callback_recap_${today}`,
    contact_id: ownerContactId,
    franchise_id: franchiseId,
    status: "sent",
    details: { count: leads.length },
  });

  return `[${franchise.name}] Récap envoyé: ${leads.length} leads`;
}
