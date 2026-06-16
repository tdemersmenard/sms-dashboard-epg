import { supabaseAdmin } from "@/lib/supabase";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";

export async function sendDailyReport(): Promise<string[]> {
  const logs: string[] = [];
  const now = new Date();
  const today = now.toLocaleDateString("en-CA", { timeZone: "America/Montreal" }); // YYYY-MM-DD

  // 1. Stats du jour
  const { data: todayJobs } = await supabaseAdmin
    .from("jobs")
    .select("id, job_type, status, contact_id")
    .eq("scheduled_date", today);

  const { data: todayPayments } = await supabaseAdmin
    .from("payments")
    .select("id, amount, status")
    .gte("created_at", `${today}T00:00:00`)
    .lte("created_at", `${today}T23:59:59`);

  const { data: todayMessages } = await supabaseAdmin
    .from("messages")
    .select("id, contact_id, direction")
    .gte("created_at", `${today}T00:00:00`)
    .lte("created_at", `${today}T23:59:59`);

  const { data: newContacts } = await supabaseAdmin
    .from("contacts")
    .select("id, first_name, last_name, stage")
    .gte("created_at", `${today}T00:00:00`)
    .lte("created_at", `${today}T23:59:59`);

  const { data: closedToday } = await supabaseAdmin
    .from("contacts")
    .select("id, first_name, last_name, season_price, services")
    .eq("stage", "closé")
    .gte("updated_at", `${today}T00:00:00`)
    .lte("updated_at", `${today}T23:59:59`);

  // Contacts actifs dans les conversations aujourd'hui
  const uniqueContacts = Array.from(new Set((todayMessages || []).map(m => m.contact_id)));
  const inboundCount = (todayMessages || []).filter(m => m.direction === "inbound").length;

  // Revenus des paiements confirmés aujourd'hui
  const revenueToday = (todayPayments || [])
    .filter(p => p.status === "payé")
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const totalContractValue = (closedToday || [])
    .reduce((sum, c) => sum + (c.season_price || 0), 0);

  // 2. Construire le rapport
  let report = `📊 RAPPORT JOURNALIER — ${today}\n\n`;

  report += `💬 CONVERSATIONS: ${uniqueContacts.length} clients actifs, ${inboundCount} messages reçus\n`;
  report += `📅 JOBS AUJOURD'HUI: ${(todayJobs || []).length} (${(todayJobs || []).filter(j => j.status === "complété").length} complétés)\n`;
  report += `🆕 NOUVEAUX LEADS: ${(newContacts || []).length}\n`;
  report += `✅ CLOSÉS AUJOURD'HUI: ${(closedToday || []).length}`;
  if (totalContractValue > 0) report += ` (${totalContractValue}$ en contrats)`;
  report += `\n`;
  if (revenueToday > 0) report += `💰 PAIEMENTS REÇUS: ${revenueToday}$\n`;

  // 3. Résumé AI de chaque conversation
  const conversationSummaries: string[] = [];

  for (const contactId of uniqueContacts.slice(0, 15)) {
    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("first_name, last_name, stage, phone")
      .eq("id", contactId)
      .single();

    if (!contact || contact.phone === "+14509942215") continue;

    const { data: todayMsgs } = await supabaseAdmin
      .from("messages")
      .select("direction, body")
      .eq("contact_id", contactId)
      .gte("created_at", `${today}T00:00:00`)
      .lte("created_at", `${today}T23:59:59`)
      .order("created_at", { ascending: true })
      .limit(20);

    if (!todayMsgs || todayMsgs.length < 2) continue;

    const convo = todayMsgs.map(m => `${m.direction === "inbound" ? "CLIENT" : "BOT"}: ${m.body}`).join("\n");
    const name = `${contact.first_name || ""} ${contact.last_name || ""}`.trim();

    try {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic();
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 150,
        messages: [
          {
            role: "user",
            content: `Résume cette conversation en 1 phrase courte en français. Dis le nom du client, ce qu'il voulait, et le résultat (closé, en attente, insatisfait, question, etc). Sois direct.\n\nClient: ${name} (stage: ${contact.stage})\n\n${convo}`,
          },
        ],
      });

      const summary = response.content[0].type === "text" ? response.content[0].text : "";
      conversationSummaries.push(`• ${summary}`);
    } catch {
      conversationSummaries.push(`• ${name}: ${todayMsgs.length} messages échangés`);
    }
  }

  if (conversationSummaries.length > 0) {
    report += `\n📋 RÉSUMÉ DES CONVERSATIONS:\n`;
    for (const s of conversationSummaries) {
      report += `${s}\n`;
    }
  }

  // 4. Envoyer le rapport à Thomas par SMS
  const { data: thomas } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("phone", "+14509942215")
    .single();

  if (thomas) {
    // Couper si trop long pour SMS (max ~1500 chars)
    const reportToSend = report.length > 1500 ? report.slice(0, 1497) + "..." : report;
    await fetch(`${BASE_URL}/api/sms/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: thomas.id, body: reportToSend }),
    });
    logs.push(`Rapport envoyé (${report.length} chars, ${conversationSummaries.length} résumés)`);
  } else {
    logs.push("Thomas introuvable — rapport non envoyé");
  }

  return logs;
}
