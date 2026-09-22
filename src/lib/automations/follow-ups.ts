import { supabaseAdmin } from "@/lib/supabase";
import { getAppUrl } from "@/config/brand";
import { getFranchiseOwner } from "@/lib/automations/helpers";

const FOLLOW_UP_DELAY_DAYS = 3;
const MAX_FOLLOW_UPS = 2;

// Stages qui sont "en cours" (pas closés, pas perdus)
const ACTIVE_STAGES = ["contacté", "soumission_envoyée", "nouveau"];

export async function sendFollowUps(franchiseId: string, nowOverride?: Date): Promise<string[]> {
  const logs: string[] = [];
  const now = nowOverride ?? new Date();
  const baseUrl = getAppUrl();

  // Heure et date MONTRÉAL (le bug du J+1 parti en 7 minutes venait de la
  // date UTC: à 22h23 Mtl, l'UTC est déjà demain → la relance "J+1" partait
  // au tick suivant). Toute la logique de dates se fait en heure locale.
  const mtl = new Date(now.toLocaleString("en-US", { timeZone: "America/Montreal" }));
  const mtlToday = now.toLocaleDateString("en-CA", { timeZone: "America/Montreal" });
  const mtlMinutes = mtl.getHours() * 60 + mtl.getMinutes();

  // Couvre-feu: AUCUN message automatique entre 21h et 8h
  if (mtlMinutes >= 21 * 60 || mtlMinutes < 8 * 60) {
    return ["couvre-feu 21h-8h — aucune relance envoyée"];
  }
  // Fenêtres d'envoi des relances programmées: 17h30-17h45 (ou 9h00-9h15
  // pour les relances "matin" promises par le bot)
  const inEveningWindow = mtlMinutes >= 17 * 60 + 30 && mtlMinutes < 17 * 60 + 45;
  const inMorningWindow = mtlMinutes >= 9 * 60 && mtlMinutes < 9 * 60 + 15;

  // Look up franchise name for messages
  const franchise = await getFranchiseOwner(franchiseId);
  const franchiseName = franchise?.name || "CHLORE";

  const MESSAGES: Record<1 | 2, (name: string) => string> = {
    1: (name: string) =>
      `Salut ${name}! C'est l'équipe ${franchiseName} 🌊 As-tu eu le temps d'y penser pour ta piscine? Une question, peut-être?`,
    2: (name: string) =>
      `Salut ${name}! Dernier petit suivi — nos places se remplissent vite. Toujours intéressé? Sinon aucun souci, on reste là si tu changes d'idée.`,
  };

  // Leads dans la liste de rappel téléphonique — le bot n'envoie pas de relance SMS pour ces contacts
  const callbackIds = new Set<string>();
  try {
    const { data: cbLeads } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("callback_status", "a_rappeler")
      .eq("franchise_id", franchiseId);
    for (const c of cbLeads ?? []) callbackIds.add(c.id);
  } catch {
    // Colonne pas encore créée — ignorer, aucun lead exclu
  }

  // Relances intelligentes (dates prévues par le bot)
  const { data: allContacts } = await supabaseAdmin
    .from("contacts")
    .select("id, first_name, last_name, phone, stage, notes")
    .not("phone", "is", null)
    .eq("franchise_id", franchiseId);

  for (const contact of allContacts || []) {
    if (!contact.notes) continue;
    if (callbackIds.has(contact.id)) continue;

    // Chercher RELANCE_PREVUE dans les notes
    const relanceMatch = contact.notes.match(/RELANCE_PREVUE:(\d{4}-\d{2}-\d{2}):(.+)/);
    if (!relanceMatch) continue;

    const relanceDate = relanceMatch[1];
    const relanceContext = relanceMatch[2].trim();

    // Si la date de relance est aujourd'hui ou passée (date MONTRÉAL)
    if (relanceDate > mtlToday) continue;

    // Fenêtre d'envoi: 9h si le bot a promis "matin", sinon 17h30
    const wantsMorning = /matin/i.test(relanceContext);
    if (wantsMorning ? !inMorningWindow : !inEveningWindow) continue;

    // Les pokes automatiques J+1/J+3 sont pour les leads SILENCIEUX:
    // si le lead a répondu entre-temps, on annule (la conversation a pris
    // le relais — pas de relance robotique par-dessus).
    const isAutoPoke = /Juste pour être sûr|Dernier petit suivi/.test(relanceContext);
    if (isAutoPoke) {
      const { data: inbound } = await supabaseAdmin
        .from("messages").select("id")
        .eq("contact_id", contact.id).eq("direction", "inbound")
        .limit(1);
      if (inbound && inbound.length > 0) {
        const cleaned = contact.notes.replace(relanceMatch[0], "").trim();
        await supabaseAdmin.from("contacts").update({ notes: cleaned || null }).eq("id", contact.id);
        logs.push(`Relance auto annulée (${contact.first_name || contact.id} a répondu entre-temps)`);
        continue;
      }
    }

    // Anti-doublon: vérifier qu'on n'a pas déjà envoyé cette relance
    const { data: existingRelance } = await supabaseAdmin
      .from("automation_logs")
      .select("id")
      .eq("contact_id", contact.id)
      .eq("action", `smart_followup_${relanceDate}`)
      .limit(1);

    if (existingRelance && existingRelance.length > 0) continue;

    // Générer un message personnalisé basé sur le contexte
    const firstName = contact.first_name || "";
    const message = `Salut ${firstName}! C'est l'équipe ${franchiseName} 🌊 ${relanceContext}`;

    try {
      await fetch(`${baseUrl}/api/sms/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id, body: message }),
      });

      await supabaseAdmin.from("automation_logs").insert({
        contact_id: contact.id,
        action: `smart_followup_${relanceDate}`,
        status: "sent",
        franchise_id: franchiseId,
        details: { context: relanceContext },
      });

      // Nettoyer la note de relance
      const cleanedNotes = contact.notes.replace(/RELANCE_PREVUE:\d{4}-\d{2}-\d{2}:.+/, "").trim();
      await supabaseAdmin.from("contacts").update({ notes: cleanedNotes || null }).eq("id", contact.id);

      logs.push(`Relance intelligente envoyée à ${firstName} ${contact.last_name || ""}: ${relanceContext}`);
    } catch (err) {
      logs.push(`Erreur relance intelligente ${firstName}: ${err}`);
    }
  }

  // Trouver les contacts actifs (pas closés) qui ont des messages
  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id, first_name, last_name, phone, stage")
    .in("stage", ACTIVE_STAGES)
    .not("phone", "is", null)
    .eq("franchise_id", franchiseId);

  if (!contacts || contacts.length === 0) {
    if (logs.length === 0) return ["Aucun contact actif à relancer"];
    return logs;
  }

  for (const contact of contacts) {
    // Skip leads dans la liste de rappel téléphonique
    if (callbackIds.has(contact.id)) {
      logs.push(`Skip relance SMS ${contact.first_name} — dans la liste de rappel`);
      continue;
    }

    // Vérifier combien de relances déjà envoyées
    const { data: existingFollowUps } = await supabaseAdmin
      .from("automation_logs")
      .select("id")
      .eq("contact_id", contact.id)
      .like("action", "follow_up_%");

    const followUpCount = existingFollowUps?.length || 0;
    if (followUpCount >= MAX_FOLLOW_UPS) continue;

    // Trouver le dernier message (envoyé ou reçu) pour ce contact
    const { data: lastMsg } = await supabaseAdmin
      .from("messages")
      .select("created_at, direction")
      .eq("contact_id", contact.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!lastMsg) continue;

    // Si le dernier message est du client (inbound), pas besoin de relancer — on attend notre tour
    if (lastMsg.direction === "inbound") continue;

    // Calculer les jours depuis le dernier message
    const lastMsgDate = new Date(lastMsg.created_at);
    const daysSinceLastMsg = Math.floor((now.getTime() - lastMsgDate.getTime()) / (1000 * 60 * 60 * 24));

    // Relancer après le délai (3 jours pour la 1ère, 6 jours pour la 2ème)
    const requiredDelay = FOLLOW_UP_DELAY_DAYS * (followUpCount + 1);
    if (daysSinceLastMsg < requiredDelay) continue;

    // Anti-doublon: vérifier qu'on n'a pas déjà envoyé aujourd'hui
    const today = mtlToday;
    const { data: todayLog } = await supabaseAdmin
      .from("automation_logs")
      .select("id")
      .eq("contact_id", contact.id)
      .eq("action", `follow_up_${followUpCount + 1}`)
      .gte("created_at", today + "T00:00:00")
      .limit(1);

    if (todayLog && todayLog.length > 0) continue;

    // Envoyer la relance
    const followUpNum = (followUpCount + 1) as 1 | 2;
    const message = MESSAGES[followUpNum](contact.first_name || "");

    try {
      await fetch(`${baseUrl}/api/sms/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          body: message,
        }),
      });

      // Logger la relance
      await supabaseAdmin.from("automation_logs").insert({
        contact_id: contact.id,
        action: `follow_up_${followUpNum}`,
        status: "sent",
        franchise_id: franchiseId,
      });

      logs.push(`Relance #${followUpNum} envoyée à ${contact.first_name} ${contact.last_name || ""}`);
    } catch (err: unknown) {
      logs.push(`Erreur relance ${contact.first_name}: ${err}`);
    }
  }

  // Marquer comme "perdu" les clients qui ont reçu 2 relances et toujours pas de réponse après 3 jours
  const { data: maxedContacts } = await supabaseAdmin
    .from("contacts")
    .select("id, first_name, last_name")
    .in("stage", ACTIVE_STAGES)
    .eq("franchise_id", franchiseId);

  for (const c of maxedContacts || []) {
    const { data: fups } = await supabaseAdmin
      .from("automation_logs")
      .select("id, created_at")
      .eq("contact_id", c.id)
      .eq("action", "follow_up_2")
      .order("created_at", { ascending: false })
      .limit(1);

    if (!fups || fups.length === 0) continue;

    const secondFollowUpDate = new Date(fups[0].created_at);
    const daysSince = Math.floor((now.getTime() - secondFollowUpDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSince >= FOLLOW_UP_DELAY_DAYS) {
      // Vérifier qu'il n'y a pas eu de nouveau message du client depuis la 2ème relance
      const { data: newMsg } = await supabaseAdmin
        .from("messages")
        .select("id")
        .eq("contact_id", c.id)
        .eq("direction", "inbound")
        .gte("created_at", fups[0].created_at)
        .limit(1);

      if (!newMsg || newMsg.length === 0) {
        await supabaseAdmin
          .from("contacts")
          .update({ stage: "perdu" })
          .eq("id", c.id);

        logs.push(`${c.first_name} ${c.last_name || ""} marqué comme perdu (2 relances sans réponse)`);
      }
    }
  }

  if (logs.length === 0) logs.push("Aucune relance nécessaire");
  return logs;
}
