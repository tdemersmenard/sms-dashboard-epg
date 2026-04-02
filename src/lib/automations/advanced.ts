import { supabaseAdmin } from "@/lib/supabase";

const THOMAS_PHONE = "+14509942215";
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";

async function sendSMS(contactId: string, body: string) {
  await fetch(`${BASE_URL}/api/sms/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contactId, body }),
  });
}

async function getOrCreateThomas(): Promise<string> {
  const { data } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("phone", THOMAS_PHONE)
    .single();
  if (data) return data.id;
  const { data: newContact } = await supabaseAdmin
    .from("contacts")
    .insert({ first_name: "Thomas", last_name: "(Admin)", phone: THOMAS_PHONE })
    .select("id")
    .single();
  return newContact!.id;
}

async function wasAlreadySent(action: string, contactId: string, withinHours: number = 24): Promise<boolean> {
  const since = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("automation_logs")
    .select("id")
    .eq("action", action)
    .eq("contact_id", contactId)
    .gte("created_at", since)
    .limit(1);
  return !!(data && data.length > 0);
}

async function logAction(action: string, contactId: string, details?: Record<string, unknown>) {
  await supabaseAdmin.from("automation_logs").insert({
    action,
    contact_id: contactId,
    status: "success",
    details: details || {},
  });
}

// ─── 1. Confirmation RDV la veille ───
export async function confirmRDVVeille() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  const { data: jobs } = await supabaseAdmin
    .from("jobs")
    .select("id, contact_id, job_type, scheduled_time_start")
    .eq("scheduled_date", tomorrowStr)
    .in("status", ["planifié", "confirmé"]);

  for (const job of jobs || []) {
    if (await wasAlreadySent("confirm_rdv_veille", job.contact_id)) continue;

    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("first_name, phone")
      .eq("id", job.contact_id)
      .single();

    if (!contact || !contact.phone.startsWith("+")) continue;

    const name = contact.first_name || "Bonjour";
    const heure = job.scheduled_time_start ? ` à ${job.scheduled_time_start.slice(0, 5)}` : "";
    const jour = tomorrow.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });

    await sendSMS(job.contact_id, `Bonjour ${name}! Un petit rappel que votre ${job.job_type} de piscine est prévue demain (${jour})${heure}. Si vous avez des questions, n'hésitez pas à nous contacter au 450-994-2215. À demain!`);
    await logAction("confirm_rdv_veille", job.contact_id, { job_id: job.id });
  }
}

// ─── 2. Suivi post-ouverture (2 jours après) ───
export async function suiviPostOuverture() {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const { data: jobs } = await supabaseAdmin
    .from("jobs")
    .select("id, contact_id, job_type")
    .eq("scheduled_date", twoDaysAgo)
    .eq("status", "complété")
    .in("job_type", ["ouverture", "entretien"]);

  for (const job of jobs || []) {
    if (await wasAlreadySent("suivi_post_ouverture", job.contact_id)) continue;

    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("first_name, phone")
      .eq("id", job.contact_id)
      .single();

    if (!contact || !contact.phone.startsWith("+")) continue;

    const name = contact.first_name || "Bonjour";
    await sendSMS(job.contact_id, `Bonjour ${name}! C'est Thomas d'Entretien Piscine Granby. Je voulais m'assurer que tout va bien avec votre piscine depuis notre passage. Est-ce que l'eau est belle? N'hésitez pas si vous avez des questions!`);
    await logAction("suivi_post_ouverture", job.contact_id, { job_id: job.id });
  }
}

// ─── 3. Demande avis Google (7 jours après le service) ───
export async function demandeAvisGoogle() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const { data: jobs } = await supabaseAdmin
    .from("jobs")
    .select("id, contact_id")
    .eq("scheduled_date", sevenDaysAgo)
    .eq("status", "complété");

  for (const job of jobs || []) {
    if (await wasAlreadySent("demande_avis_google", job.contact_id)) continue;

    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("first_name, phone")
      .eq("id", job.contact_id)
      .single();

    if (!contact || !contact.phone.startsWith("+")) continue;

    const name = contact.first_name || "Bonjour";
    await sendSMS(job.contact_id, `Bonjour ${name}! J'espère que vous profitez bien de votre piscine. Si vous êtes satisfait de nos services, un petit avis Google nous aiderait énormément. Merci beaucoup et bonne baignade!`);
    await logAction("demande_avis_google", job.contact_id, { job_id: job.id });
  }
}

// ─── 4. Résumé quotidien pour Thomas (le matin) ───
export async function resumeQuotidien() {
  const thomasId = await getOrCreateThomas();
  const today = new Date().toISOString().split("T")[0];

  if (await wasAlreadySent("resume_quotidien", thomasId, 20)) return;

  const { data: todayJobs } = await supabaseAdmin
    .from("jobs")
    .select("job_type, scheduled_time_start, contact_id")
    .eq("scheduled_date", today)
    .in("status", ["planifié", "confirmé"]);

  let jobsList = "Aucun";
  if (todayJobs && todayJobs.length > 0) {
    const jobDetails = [];
    for (const job of todayJobs) {
      const { data: c } = await supabaseAdmin.from("contacts").select("first_name, last_name").eq("id", job.contact_id).single();
      const name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ") : "?";
      const heure = job.scheduled_time_start ? job.scheduled_time_start.slice(0, 5) : "?";
      jobDetails.push(`${heure} — ${job.job_type} ${name}`);
    }
    jobsList = jobDetails.join("\n");
  }

  const { count: unreadCount } = await supabaseAdmin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("direction", "inbound")
    .eq("is_read", false);

  const { data: pendingPayments } = await supabaseAdmin
    .from("payments")
    .select("amount")
    .eq("status", "en_attente");
  const totalPending = (pendingPayments || []).reduce((sum, p) => sum + (p.amount || 0), 0);

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: newLeads } = await supabaseAdmin
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .gte("created_at", yesterday);

  const message = `CHLORE — Résumé du ${new Date().toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" })}

Rendez-vous aujourd'hui:
${jobsList}

${unreadCount || 0} messages non-lus
${newLeads || 0} nouveaux leads (24h)
${totalPending > 0 ? `${totalPending}$ en paiements en attente` : "Aucun paiement en attente"}

Bonne journée!`;

  await sendSMS(thomasId, message);
  await logAction("resume_quotidien", thomasId);
}

// ─── 5. Rappel de qui appeler aujourd'hui ───
export async function rappelAppels() {
  const thomasId = await getOrCreateThomas();
  const today = new Date().toISOString().split("T")[0];

  if (await wasAlreadySent("rappel_appels", thomasId, 20)) return;

  const { data: rappels } = await supabaseAdmin
    .from("jobs")
    .select("contact_id, notes, scheduled_time_start")
    .eq("scheduled_date", today)
    .in("job_type", ["visite", "autre"]);

  if (!rappels || rappels.length === 0) return;

  const lines = [];
  for (const r of rappels) {
    const { data: c } = await supabaseAdmin.from("contacts").select("first_name, last_name, phone").eq("id", r.contact_id).single();
    const name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ") : "?";
    const heure = r.scheduled_time_start ? r.scheduled_time_start.slice(0, 5) : "";
    lines.push(`${heure ? heure + " — " : ""}${name} (${c?.phone || "?"})${r.notes ? " — " + r.notes : ""}`);
  }

  await sendSMS(thomasId, `CHLORE — Appels à faire aujourd'hui:\n${lines.join("\n")}`);
  await logAction("rappel_appels", thomasId);
}

// ─── 6. Stats hebdomadaires (dimanche soir) ───
export async function statsHebdo() {
  const thomasId = await getOrCreateThomas();

  if (await wasAlreadySent("stats_hebdo", thomasId, 160)) return;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { count: newLeads } = await supabaseAdmin
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .gte("created_at", weekAgo);

  const { data: closedContacts } = await supabaseAdmin
    .from("contacts")
    .select("season_price")
    .eq("stage", "closé")
    .gte("updated_at", weekAgo);
  const weekRevenue = (closedContacts || []).reduce((sum, c) => sum + (c.season_price || 0), 0);

  const { data: receivedPayments } = await supabaseAdmin
    .from("payments")
    .select("amount")
    .eq("status", "reçu")
    .gte("received_date", weekAgo.split("T")[0]);
  const weekPayments = (receivedPayments || []).reduce((sum, p) => sum + (p.amount || 0), 0);

  const { count: completedJobs } = await supabaseAdmin
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "complété")
    .gte("scheduled_date", weekAgo.split("T")[0]);

  const { count: totalMsgs } = await supabaseAdmin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .gte("created_at", weekAgo);

  await sendSMS(thomasId, `CHLORE — Stats de la semaine:

${newLeads || 0} nouveaux leads
${weekRevenue > 0 ? weekRevenue + "$ de revenue closé" : "0$ closé"}
${weekPayments > 0 ? weekPayments + "$ de paiements reçus" : "0$ reçu"}
${completedJobs || 0} jobs complétés
${totalMsgs || 0} messages échangés

Continue comme ça!`);

  await logAction("stats_hebdo", thomasId);
}

// ─── 7. Alerte paiement reçu ───
export async function alertePaiementRecu() {
  const thomasId = await getOrCreateThomas();
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const { data: recentPayments } = await supabaseAdmin
    .from("payments")
    .select("id, contact_id, amount, notes")
    .eq("status", "reçu")
    .gte("created_at", fifteenMinAgo);

  for (const payment of recentPayments || []) {
    if (await wasAlreadySent("alerte_paiement_" + payment.id, thomasId, 24)) continue;

    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("first_name, last_name")
      .eq("id", payment.contact_id)
      .single();

    const name = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") : "?";

    await sendSMS(thomasId, `CHLORE: Paiement reçu! ${name} a payé ${payment.amount}$ ${payment.notes ? "— " + payment.notes : ""}`);
    await logAction("alerte_paiement_" + payment.id, thomasId, { amount: payment.amount });
  }
}

// ─── RUNNER: exécute toutes les automations avancées ───
export async function runAdvancedAutomations() {
  const results: string[] = [];

  try { await confirmRDVVeille(); results.push("confirmRDVVeille OK"); } catch (e) { results.push("confirmRDVVeille ERROR: " + e); }
  try { await suiviPostOuverture(); results.push("suiviPostOuverture OK"); } catch (e) { results.push("suiviPostOuverture ERROR: " + e); }
  try { await demandeAvisGoogle(); results.push("demandeAvisGoogle OK"); } catch (e) { results.push("demandeAvisGoogle ERROR: " + e); }
  try { await alertePaiementRecu(); results.push("alertePaiementRecu OK"); } catch (e) { results.push("alertePaiementRecu ERROR: " + e); }

  // Résumé quotidien — seulement entre 7h et 8h du matin (heure de Montréal)
  const hour = new Date().toLocaleString("en-US", { timeZone: "America/Montreal", hour: "numeric", hour12: false });
  if (parseInt(hour) === 7) {
    try { await resumeQuotidien(); results.push("resumeQuotidien OK"); } catch (e) { results.push("resumeQuotidien ERROR: " + e); }
    try { await rappelAppels(); results.push("rappelAppels OK"); } catch (e) { results.push("rappelAppels ERROR: " + e); }
  }

  // Stats hebdo — seulement dimanche soir (entre 20h et 21h)
  const day = new Date().toLocaleString("en-US", { timeZone: "America/Montreal", weekday: "long" });
  if (day === "Sunday" && parseInt(hour) === 20) {
    try { await statsHebdo(); results.push("statsHebdo OK"); } catch (e) { results.push("statsHebdo ERROR: " + e); }
  }

  return results;
}
