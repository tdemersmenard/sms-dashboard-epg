import { supabaseAdmin } from "@/lib/supabase";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";

async function sendSMS(contactId: string, body: string) {
  await fetch(`${BASE_URL}/api/sms/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contactId, body }),
  });
}

async function wasAlreadySent(action: string, contactId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("automation_logs")
    .select("id")
    .eq("action", action)
    .eq("contact_id", contactId)
    .limit(1);
  return !!(data && data.length > 0);
}

async function logAction(action: string, contactId: string) {
  await supabaseAdmin.from("automation_logs").insert({
    action,
    contact_id: contactId,
    status: "success",
  });
}

export async function sendJobReminders() {
  const results: string[] = [];
  const now = new Date();
  const montrealNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Montreal" }));
  const today = montrealNow.toISOString().split("T")[0];

  const tomorrow = new Date(montrealNow);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  const currentHour = montrealNow.getHours();
  const currentMinute = montrealNow.getMinutes();

  // ─── RAPPEL 1 JOUR AVANT ───
  const { data: tomorrowJobs } = await supabaseAdmin
    .from("jobs")
    .select("id, contact_id, job_type, scheduled_time_start")
    .eq("scheduled_date", tomorrowStr)
    .in("status", ["planifié", "confirmé"])
    .neq("job_type", "autre");

  for (const job of tomorrowJobs || []) {
    const actionKey = `reminder_1day_${job.id}`;
    if (await wasAlreadySent(actionKey, job.contact_id)) continue;

    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("first_name, phone")
      .eq("id", job.contact_id)
      .single();

    if (!contact || !contact.phone?.startsWith("+")) continue;

    const name = contact.first_name || "Bonjour";
    const heure = job.scheduled_time_start ? ` à ${job.scheduled_time_start.slice(0, 5)}` : "";
    const jour = tomorrow.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });

    await sendSMS(job.contact_id, `Bonjour ${name}! Petit rappel que votre ${job.job_type} de piscine est prévue demain (${jour})${heure}. Si vous avez des questions, contactez-nous au 450-994-2215. À demain!`);
    await logAction(actionKey, job.contact_id);
    results.push(`Rappel 1 jour: ${name} pour ${job.job_type} le ${tomorrowStr}`);
  }

  // ─── RAPPEL 1 HEURE AVANT ───
  const { data: todayJobs } = await supabaseAdmin
    .from("jobs")
    .select("id, contact_id, job_type, scheduled_time_start")
    .eq("scheduled_date", today)
    .in("status", ["planifié", "confirmé"])
    .neq("job_type", "autre");

  for (const job of todayJobs || []) {
    if (!job.scheduled_time_start) continue;

    const [jobH, jobM] = job.scheduled_time_start.split(":").map(Number);
    const jobMinutes = jobH * 60 + jobM;
    const nowMinutes = currentHour * 60 + currentMinute;

    // Envoyer si on est entre 45 et 75 minutes avant le job
    const minutesBefore = jobMinutes - nowMinutes;
    if (minutesBefore < 45 || minutesBefore > 75) continue;

    const actionKey = `reminder_1hour_${job.id}`;
    if (await wasAlreadySent(actionKey, job.contact_id)) continue;

    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("first_name, phone")
      .eq("id", job.contact_id)
      .single();

    if (!contact || !contact.phone?.startsWith("+")) continue;

    const name = contact.first_name || "Bonjour";

    await sendSMS(job.contact_id, `Bonjour ${name}! Thomas est en route pour votre ${job.job_type} de piscine prévu à ${job.scheduled_time_start.slice(0, 5)}. À tout de suite!`);
    await logAction(actionKey, job.contact_id);
    results.push(`Rappel 1h: ${name} pour ${job.job_type} à ${job.scheduled_time_start}`);
  }

  return results;
}
