import { supabaseAdmin } from "@/lib/supabase";

interface BaseAction {
  type: string;
}

interface GenerateInvoiceAction extends BaseAction {
  type: "GENERATE_INVOICE";
  service: string;
  amount: number;
}

interface GenerateContractAction extends BaseAction {
  type: "GENERATE_CONTRACT";
  service: string;
  amount: number;
}

interface BookJobAction extends BaseAction {
  type: "BOOK_JOB";
  jobType: string;
  date: string;
  time: string;
}

interface ReminderAction extends BaseAction {
  type: "REMINDER";
  date: string;
  time: string;
  description: string;
}

interface NotifyThomasAction extends BaseAction {
  type: "NOTIFY_THOMAS";
  message: string;
}

interface UpdateStageAction extends BaseAction {
  type: "UPDATE_STAGE";
  stage: string;
}

type AIAction = GenerateInvoiceAction | GenerateContractAction | BookJobAction | ReminderAction | NotifyThomasAction | UpdateStageAction;

export function parseActions(aiResponse: string): { cleanMessage: string; actions: AIAction[] } {
  const actions: AIAction[] = [];
  const messageLines: string[] = [];

  const lines = aiResponse.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    console.log("[parseActions] Line:", JSON.stringify(trimmed), "isAction:", trimmed.startsWith("__ACTION:"));

    if (trimmed === "__NO_REPLY__") continue;

    // NOTIFY_THOMAS
    const notifyMatch = trimmed.match(/^__ACTION:NOTIFY_THOMAS:(.+)__$/);
    if (notifyMatch) {
      actions.push({ type: "NOTIFY_THOMAS", message: notifyMatch[1] });
      continue;
    }

    // BOOK_JOB
    const bookMatch = trimmed.match(/^__ACTION:BOOK_JOB:(.+?):(\d{4}-\d{2}-\d{2}):(\d{2}:\d{2})__$/);
    if (bookMatch) {
      actions.push({ type: "BOOK_JOB", jobType: bookMatch[1], date: bookMatch[2], time: bookMatch[3] });
      continue;
    }

    // GENERATE_INVOICE
    const invoiceMatch = trimmed.match(/^__ACTION:GENERATE_INVOICE:(.+?):(\d+)__$/);
    if (invoiceMatch) {
      actions.push({ type: "GENERATE_INVOICE", service: invoiceMatch[1], amount: parseInt(invoiceMatch[2]) });
      continue;
    }

    // GENERATE_CONTRACT
    const contractMatch = trimmed.match(/^__ACTION:GENERATE_CONTRACT:(.+?):(\d+)__$/);
    if (contractMatch) {
      actions.push({ type: "GENERATE_CONTRACT", service: contractMatch[1], amount: parseInt(contractMatch[2]) });
      continue;
    }

    // UPDATE_STAGE
    const stageMatch = trimmed.match(/^__ACTION:UPDATE_STAGE:(.+)__$/);
    if (stageMatch) {
      actions.push({ type: "UPDATE_STAGE", stage: stageMatch[1] });
      continue;
    }

    // REMINDER
    const reminderMatch = trimmed.match(/^__ACTION:REMINDER:(\d{4}-\d{2}-\d{2}):(\d{2}:\d{2}):(.+)__$/);
    if (reminderMatch) {
      actions.push({ type: "REMINDER", date: reminderMatch[1], time: reminderMatch[2], description: reminderMatch[3] });
      continue;
    }

    // Not an action — keep as message
    messageLines.push(line);
  }

  return {
    cleanMessage: messageLines.join("\n").trim(),
    actions,
  };
}

export async function executeActions(actions: AIAction[], contactId: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";

  for (const action of actions) {
    try {
      switch (action.type) {

        case "NOTIFY_THOMAS": {
          const { data: contact } = await supabaseAdmin
            .from("contacts")
            .select("first_name, last_name, phone")
            .eq("id", contactId)
            .single();
          const clientName = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") : "Inconnu";
          const clientPhone = contact?.phone || "";

          // Find or create Thomas's admin contact
          let { data: thomas } = await supabaseAdmin
            .from("contacts")
            .select("id")
            .eq("phone", "+14509942215")
            .maybeSingle();

          if (!thomas) {
            const { data: newThomas } = await supabaseAdmin
              .from("contacts")
              .insert({ first_name: "Thomas", last_name: "(Admin)", phone: "+14509942215" })
              .select("id")
              .single();
            thomas = newThomas;
          }

          if (thomas) {
            const notification = `CHLORE: ${clientName} (${clientPhone}) — ${action.message}`;
            await fetch(`${baseUrl}/api/sms/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contactId: thomas.id, body: notification }),
            });
          }
          console.log(`[ai-actions] Notified Thomas: ${action.message}`);
          break;
        }

        case "BOOK_JOB": {
          const endHour = parseInt(action.time.split(":")[0]) + 2;
          const endTime = `${String(endHour).padStart(2, "0")}:${action.time.split(":")[1]}`;

          await supabaseAdmin.from("jobs").insert({
            contact_id: contactId,
            job_type: action.jobType,
            scheduled_date: action.date,
            scheduled_time_start: action.time,
            scheduled_time_end: endTime,
            status: "confirmé",
          });
          console.log(`[ai-actions] Booked ${action.jobType} on ${action.date} at ${action.time}`);
          break;
        }

        case "GENERATE_INVOICE": {
          const { count } = await supabaseAdmin
            .from("documents")
            .select("id", { count: "exact", head: true })
            .eq("doc_type", "facture");
          const docNumber = `F-2026-${String((count || 0) + 1).padStart(3, "0")}`;

          const { data: contact } = await supabaseAdmin
            .from("contacts")
            .select("*")
            .eq("id", contactId)
            .single();

          const { data: doc } = await supabaseAdmin.from("documents").insert({
            contact_id: contactId,
            doc_type: "facture",
            doc_number: docNumber,
            amount: action.amount,
            status: "brouillon",
            data: {
              service: action.service,
              client_name: contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") : "",
              client_email: contact?.email,
              client_phone: contact?.phone,
              client_address: contact?.address,
              payment_terms: `Paiement complet de ${action.amount}$ requis avant le service.`,
            },
          }).select().single();

          if (contact?.email && doc) {
            await supabaseAdmin.from("documents").update({ status: "envoyé" }).eq("id", doc.id);
            await fetch(`${baseUrl}/api/email/send-document`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ documentId: doc.id, contactId }),
            }).catch(err => console.error("[ai-actions] Email error:", err));
          }

          await supabaseAdmin.from("contacts").update({
            stage: "closé",
            season_price: action.amount,
          }).eq("id", contactId);

          console.log(`[ai-actions] Invoice ${docNumber}: ${action.service} ${action.amount}$`);
          break;
        }

        case "GENERATE_CONTRACT": {
          const { count } = await supabaseAdmin
            .from("documents")
            .select("id", { count: "exact", head: true })
            .eq("doc_type", "contrat");
          const docNumber = `C-2026-${String((count || 0) + 1).padStart(3, "0")}`;

          const { data: contact } = await supabaseAdmin
            .from("contacts")
            .select("*")
            .eq("id", contactId)
            .single();

          const firstPayment = Math.ceil(action.amount / 2);
          const secondPayment = action.amount - firstPayment;

          const { data: doc } = await supabaseAdmin.from("documents").insert({
            contact_id: contactId,
            doc_type: "contrat",
            doc_number: docNumber,
            amount: action.amount,
            status: "brouillon",
            data: {
              service: action.service,
              client_name: contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") : "",
              client_email: contact?.email,
              client_phone: contact?.phone,
              client_address: contact?.address,
              payment_terms: `Versement 1: ${firstPayment}$ à la signature. Versement 2: ${secondPayment}$ mi-juillet 2026.`,
            },
          }).select().single();

          if (contact?.email && doc) {
            await supabaseAdmin.from("documents").update({ status: "envoyé" }).eq("id", doc.id);
            await fetch(`${baseUrl}/api/email/send-document`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ documentId: doc.id, contactId }),
            }).catch(err => console.error("[ai-actions] Email error:", err));
          }

          await supabaseAdmin.from("contacts").update({
            stage: "closé",
            season_price: action.amount,
          }).eq("id", contactId);

          console.log(`[ai-actions] Contract ${docNumber}: ${action.service} ${action.amount}$`);
          break;
        }

        case "UPDATE_STAGE": {
          await supabaseAdmin.from("contacts").update({ stage: action.stage }).eq("id", contactId);
          console.log(`[ai-actions] Updated stage to ${action.stage}`);
          break;
        }

        case "REMINDER": {
          await supabaseAdmin.from("jobs").insert({
            contact_id: contactId,
            job_type: "autre",
            scheduled_date: action.date,
            scheduled_time_start: action.time,
            notes: action.description,
            status: "planifié",
          });
          console.log(`[ai-actions] Reminder: ${action.date} ${action.time} — ${action.description}`);
          break;
        }
      }
    } catch (err) {
      console.error(`[ai-actions] Error executing ${action.type}:`, err);
    }
  }
}
