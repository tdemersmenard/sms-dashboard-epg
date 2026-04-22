import { supabaseAdmin } from "@/lib/supabase";

const FOLLOW_UP_DELAY_DAYS = 3;
const MAX_FOLLOW_UPS = 2;

// Stages qui sont "en cours" (pas closés, pas perdus)
const ACTIVE_STAGES = ["contacté", "soumission_envoyée", "nouveau"];

const MESSAGES: Record<1 | 2, (name: string) => string> = {
  1: (name: string) =>
    `Bonjour ${name}! C'est Entretien Piscine Granby. Je voulais juste faire un suivi — avez-vous eu le temps de réfléchir pour votre piscine? N'hésitez pas si vous avez des questions, on est là pour vous! 😊`,
  2: (name: string) =>
    `Bonjour ${name}! Dernier petit suivi de notre part. La saison d'ouverture bat son plein et nos plages horaires se remplissent vite. Si vous êtes toujours intéressé(e), on peut vous réserver une place rapidement. Sinon, pas de souci du tout — on reste disponible si vous changez d'avis! Bonne journée!`,
};

export async function sendFollowUps(): Promise<string[]> {
  const logs: string[] = [];
  const now = new Date();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";

  // Trouver les contacts actifs (pas closés) qui ont des messages
  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id, first_name, last_name, phone, stage")
    .in("stage", ACTIVE_STAGES)
    .not("phone", "is", null);

  if (!contacts || contacts.length === 0) return ["Aucun contact actif à relancer"];

  for (const contact of contacts) {
    // Skip Thomas Admin
    if (contact.phone === "+14509942215") continue;

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
    const today = now.toISOString().split("T")[0];
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
    .in("stage", ACTIVE_STAGES);

  for (const c of maxedContacts || []) {
    if (c.id === "3828bc88-31da-482d-ae38-66933d534d0a") continue; // Skip Thomas

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
