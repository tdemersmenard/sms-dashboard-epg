import { supabaseAdmin } from "@/lib/supabase";
import { twilioClient, twilioPhoneNumber } from "@/lib/twilio";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fillTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{([^}]+)\}\}/g, (_, key) => vars[key.trim()] ?? "");
}

function contactVars(c: {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  services?: string[] | null;
  season_price?: number | null;
}): Record<string, string> {
  const prenom =
    c.first_name && c.first_name !== "Inconnu" ? c.first_name : (c.phone ?? "");
  const nom = c.last_name ?? "";
  return {
    prénom: prenom,
    nom,
    service: (c.services ?? []).join(", "),
    montant: c.season_price != null ? `${c.season_price}$` : "",
  };
}

async function getTemplate(name: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("message_templates")
    .select("body")
    .eq("name", name)
    .single();
  return data?.body ?? null;
}

async function alreadyLogged(
  contactId: string,
  action: string,
  windowHours: number
): Promise<boolean> {
  const since = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("automation_logs")
    .select("id")
    .eq("contact_id", contactId)
    .eq("action", action)
    .eq("status", "success")
    .gte("created_at", since)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

async function sendSMS(
  contactId: string,
  phone: string,
  body: string
): Promise<void> {
  const msg = await twilioClient.messages.create({
    body,
    from: twilioPhoneNumber,
    to: phone,
  });
  await supabaseAdmin.from("messages").insert({
    contact_id: contactId,
    twilio_sid: msg.sid,
    direction: "outbound",
    body,
    status: msg.status,
    is_read: true,
  });
}

async function log(
  contactId: string,
  action: string,
  status: "success" | "error",
  details?: string
): Promise<void> {
  await supabaseAdmin.from("automation_logs").insert({
    contact_id: contactId,
    action,
    status,
    details: details ? { message: details } : null,
  });
}

// ── Main engine ───────────────────────────────────────────────────────────────

export interface AutomationResult {
  action: string;
  contact: string;
  status: "success" | "error";
  error?: string;
}

export async function runAutomations(): Promise<AutomationResult[]> {
  const results: AutomationResult[] = [];
  const now = new Date();

  // ── A. RELANCES ────────────────────────────────────────────────────────────

  // 1. Nouveaux leads avec message outbound mais aucun inbound depuis 48h
  {
    const ACTION = "relance_nouveau_lead";
    const cutoff = new Date(now.getTime() - 48 * 3600 * 1000).toISOString();

    const { data: contacts } = await supabaseAdmin
      .from("contacts")
      .select("id, phone, first_name, last_name, services, season_price")
      .eq("stage", "nouveau");

    for (const contact of contacts ?? []) {
      try {
        // Skip si le lead a répondu (message inbound reçu)
        const { data: inbound } = await supabaseAdmin
          .from("messages")
          .select("id")
          .eq("contact_id", contact.id)
          .eq("direction", "inbound")
          .limit(1);

        if ((inbound?.length ?? 0) > 0) continue;

        // Check qu'on a envoyé le premier contact (message outbound existe)
        const { data: outbound } = await supabaseAdmin
          .from("messages")
          .select("id")
          .eq("contact_id", contact.id)
          .eq("direction", "outbound")
          .limit(1);

        if ((outbound?.length ?? 0) === 0) continue;

        // Check que le dernier outbound date de plus de 48h
        const { data: recentOut } = await supabaseAdmin
          .from("messages")
          .select("id")
          .eq("contact_id", contact.id)
          .eq("direction", "outbound")
          .gte("created_at", cutoff)
          .limit(1);

        if ((recentOut?.length ?? 0) > 0) continue;
        if (await alreadyLogged(contact.id, ACTION, 48)) continue;

        const tmpl = await getTemplate("Relance nouveau lead");
        if (!tmpl) continue;

        const body = fillTemplate(tmpl, contactVars(contact));
        await sendSMS(contact.id, contact.phone, body);
        await log(contact.id, ACTION, "success");
        results.push({ action: ACTION, contact: contact.id, status: "success" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await log(contact.id, ACTION, "error", msg);
        results.push({ action: ACTION, contact: contact.id, status: "error", error: msg });
      }
    }
  }

  // 2. Soumission envoyée sans message inbound depuis 72h
  {
    const ACTION = "relance_soumission";
    const cutoff = new Date(now.getTime() - 72 * 3600 * 1000).toISOString();

    const { data: contacts } = await supabaseAdmin
      .from("contacts")
      .select("id, phone, first_name, last_name, services, season_price")
      .eq("stage", "soumission envoyée");

    for (const contact of contacts ?? []) {
      try {
        const { data: msgs } = await supabaseAdmin
          .from("messages")
          .select("id")
          .eq("contact_id", contact.id)
          .eq("direction", "inbound")
          .gte("created_at", cutoff)
          .limit(1);

        if ((msgs?.length ?? 0) > 0) continue;
        if (await alreadyLogged(contact.id, ACTION, 72)) continue;

        const tmpl = await getTemplate("Relance soumission");
        if (!tmpl) continue;

        const body = fillTemplate(tmpl, contactVars(contact));
        await sendSMS(contact.id, contact.phone, body);
        await log(contact.id, ACTION, "success");
        results.push({ action: ACTION, contact: contact.id, status: "success" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await log(contact.id, ACTION, "error", msg);
        results.push({ action: ACTION, contact: contact.id, status: "error", error: msg });
      }
    }
  }

  // ── B. PAIEMENTS ──────────────────────────────────────────────────────────

  // 3. Paiement dû dans 7 jours
  {
    const ACTION = "rappel_paiement_7j";
    const in7 = new Date(now.getTime() + 7 * 86400 * 1000);
    const dueDateStr = in7.toISOString().slice(0, 10);

    const { data: payments } = await supabaseAdmin
      .from("payments")
      .select("id, contact_id, amount, due_date, contacts(phone, first_name, last_name, services, season_price)")
      .eq("status", "en_attente")
      .eq("due_date", dueDateStr);

    for (const payment of payments ?? []) {
      const contact = payment.contacts as unknown as { phone: string; first_name: string | null; last_name: string | null; services: string[] | null; season_price: number | null } | null;
      if (!contact?.phone) continue;
      try {
        if (await alreadyLogged(payment.contact_id, ACTION, 24)) continue;

        const tmpl = await getTemplate("Rappel paiement");
        if (!tmpl) continue;

        const body = fillTemplate(tmpl, {
          ...contactVars(contact),
          montant: `${payment.amount}$`,
          date: payment.due_date ?? "",
        });
        await sendSMS(payment.contact_id, contact.phone, body);
        await log(payment.contact_id, ACTION, "success");
        results.push({ action: ACTION, contact: payment.contact_id, status: "success" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await log(payment.contact_id, ACTION, "error", msg);
        results.push({ action: ACTION, contact: payment.contact_id, status: "error", error: msg });
      }
    }
  }

  // 4. Paiement en retard de 3+ jours → update status + SMS
  {
    const ACTION = "paiement_en_retard";
    const threeDaysAgo = new Date(now.getTime() - 3 * 86400 * 1000).toISOString().slice(0, 10);

    const { data: payments } = await supabaseAdmin
      .from("payments")
      .select("id, contact_id, amount, due_date, contacts(phone, first_name, last_name, services, season_price)")
      .eq("status", "en_attente")
      .lt("due_date", threeDaysAgo);

    for (const payment of payments ?? []) {
      const contact = payment.contacts as unknown as { phone: string; first_name: string | null; last_name: string | null; services: string[] | null; season_price: number | null } | null;
      if (!contact?.phone) continue;
      try {
        // Update to en_retard
        await supabaseAdmin
          .from("payments")
          .update({ status: "en_retard" })
          .eq("id", payment.id);

        if (await alreadyLogged(payment.contact_id, ACTION, 72)) continue;

        const tmpl = await getTemplate("Rappel paiement");
        if (!tmpl) continue;

        const body = fillTemplate(tmpl, {
          ...contactVars(contact),
          montant: `${payment.amount}$`,
          date: payment.due_date ?? "",
        });
        await sendSMS(payment.contact_id, contact.phone, body);
        await log(payment.contact_id, ACTION, "success");
        results.push({ action: ACTION, contact: payment.contact_id, status: "success" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await log(payment.contact_id, ACTION, "error", msg);
        results.push({ action: ACTION, contact: payment.contact_id, status: "error", error: msg });
      }
    }
  }

  // ── C. JOBS ───────────────────────────────────────────────────────────────

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  // 5. Rappel RDV veille
  {
    const ACTION = "rappel_rdv_veille";

    const { data: jobs } = await supabaseAdmin
      .from("jobs")
      .select("id, contact_id, job_type, scheduled_date, scheduled_time_start, scheduled_time_end, contacts(phone, first_name, last_name, services, season_price)")
      .eq("scheduled_date", tomorrowStr)
      .in("status", ["planifié", "confirmé"]);

    for (const job of jobs ?? []) {
      const contact = job.contacts as unknown as { phone: string; first_name: string | null; last_name: string | null; services: string[] | null; season_price: number | null } | null;
      if (!contact?.phone) continue;
      try {
        if (await alreadyLogged(job.contact_id, ACTION, 24)) continue;

        const tmpl = await getTemplate("Rappel RDV veille");
        if (!tmpl) continue;

        const body = fillTemplate(tmpl, {
          ...contactVars(contact),
          date: job.scheduled_date,
          service: job.job_type,
          heure_début: job.scheduled_time_start ?? "",
          heure_fin: job.scheduled_time_end ?? "",
        });
        await sendSMS(job.contact_id, contact.phone, body);
        await log(job.contact_id, ACTION, "success");
        results.push({ action: ACTION, contact: job.contact_id, status: "success" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await log(job.contact_id, ACTION, "error", msg);
        results.push({ action: ACTION, contact: job.contact_id, status: "error", error: msg });
      }
    }
  }

  // 6. Job complété il y a 24h → Suivi
  {
    const ACTION = "suivi_job_complete_24h";
    const since24 = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
    const since48 = new Date(now.getTime() - 48 * 3600 * 1000).toISOString();

    const { data: jobs } = await supabaseAdmin
      .from("jobs")
      .select("id, contact_id, job_type, completed_at, contacts(phone, first_name, last_name, services, season_price)")
      .eq("status", "complété")
      .gte("completed_at", since48)
      .lte("completed_at", since24);

    for (const job of jobs ?? []) {
      const contact = job.contacts as unknown as { phone: string; first_name: string | null; last_name: string | null; services: string[] | null; season_price: number | null } | null;
      if (!contact?.phone) continue;
      try {
        if (await alreadyLogged(job.contact_id, ACTION, 48)) continue;

        const tmpl = await getTemplate("Job complété");
        if (!tmpl) continue;

        const body = fillTemplate(tmpl, {
          ...contactVars(contact),
          service: job.job_type,
        });
        await sendSMS(job.contact_id, contact.phone, body);
        await log(job.contact_id, ACTION, "success");
        results.push({ action: ACTION, contact: job.contact_id, status: "success" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await log(job.contact_id, ACTION, "error", msg);
        results.push({ action: ACTION, contact: job.contact_id, status: "error", error: msg });
      }
    }
  }

  // 7. Job complété il y a 7 jours → Demande avis Google
  {
    const ACTION = "demande_avis_google";
    const since7d  = new Date(now.getTime() - 7  * 86400 * 1000).toISOString();
    const since8d  = new Date(now.getTime() - 8  * 86400 * 1000).toISOString();

    const { data: jobs } = await supabaseAdmin
      .from("jobs")
      .select("id, contact_id, job_type, completed_at, contacts(phone, first_name, last_name, services, season_price)")
      .eq("status", "complété")
      .gte("completed_at", since8d)
      .lte("completed_at", since7d);

    for (const job of jobs ?? []) {
      const contact = job.contacts as unknown as { phone: string; first_name: string | null; last_name: string | null; services: string[] | null; season_price: number | null } | null;
      if (!contact?.phone) continue;
      try {
        if (await alreadyLogged(job.contact_id, ACTION, 8 * 24)) continue;

        const tmpl = await getTemplate("Demande avis Google");
        if (!tmpl) continue;

        const body = fillTemplate(tmpl, { ...contactVars(contact), service: job.job_type });
        await sendSMS(job.contact_id, contact.phone, body);
        await log(job.contact_id, ACTION, "success");
        results.push({ action: ACTION, contact: job.contact_id, status: "success" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await log(job.contact_id, ACTION, "error", msg);
        results.push({ action: ACTION, contact: job.contact_id, status: "error", error: msg });
      }
    }
  }

  return results;
}
