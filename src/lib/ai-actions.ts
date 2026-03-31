import { supabaseAdmin } from "@/lib/supabase";

type GenerateInvoiceAction = {
  type: "GENERATE_INVOICE";
  service: string;
  amount: number;
};

type GenerateContractAction = {
  type: "GENERATE_CONTRACT";
  service: string;
  amount: number;
};

type BookJobAction = {
  type: "BOOK_JOB";
  jobType: string;
  date: string;
  time: string;
};

type ReminderAction = {
  type: "REMINDER";
  date: string;
  time: string;
  description: string;
};

type EscalateAction = {
  type: "ESCALATE";
  description: string;
};

type AIAction = GenerateInvoiceAction | GenerateContractAction | BookJobAction | ReminderAction | EscalateAction;

export function parseActions(aiResponse: string): { cleanMessage: string; actions: AIAction[] } {
  const actions: AIAction[] = [];
  const lines = aiResponse.split("\n");
  const messageLines: string[] = [];

  for (const line of lines) {
    // GENERATE_INVOICE / GENERATE_CONTRACT
    const docMatch = line.match(/^__ACTION:(GENERATE_INVOICE|GENERATE_CONTRACT):(.+):(\d+)__$/);
    if (docMatch) {
      actions.push({
        type: docMatch[1] as "GENERATE_INVOICE" | "GENERATE_CONTRACT",
        service: docMatch[2],
        amount: parseInt(docMatch[3]),
      });
      continue;
    }

    // BOOK_JOB: __ACTION:BOOK_JOB:{jobType}:{date}:{time}__
    const bookMatch = line.match(/^__ACTION:BOOK_JOB:(.+):(\d{4}-\d{2}-\d{2}):(\d{2}:\d{2})__$/);
    if (bookMatch) {
      actions.push({
        type: "BOOK_JOB",
        jobType: bookMatch[1],
        date: bookMatch[2],
        time: bookMatch[3],
      });
      continue;
    }

    // REMINDER: __ACTION:REMINDER:{date}:{time}:{description}__
    const reminderMatch = line.match(/^__ACTION:REMINDER:(\d{4}-\d{2}-\d{2}):(\d{2}:\d{2}):(.+)__$/);
    if (reminderMatch) {
      actions.push({
        type: "REMINDER",
        date: reminderMatch[1],
        time: reminderMatch[2],
        description: reminderMatch[3],
      });
      continue;
    }

    // ESCALATE: __ACTION:ESCALATE:{description}__
    const escalateMatch = line.match(/^__ACTION:ESCALATE:(.+)__$/);
    if (escalateMatch) {
      actions.push({
        type: "ESCALATE",
        description: escalateMatch[1],
      });
      continue;
    }

    messageLines.push(line);
  }

  return {
    cleanMessage: messageLines.join("\n").trim(),
    actions,
  };
}

export async function executeActions(actions: AIAction[], contactId: string) {
  for (const action of actions) {
    try {
      if (action.type === "GENERATE_INVOICE" || action.type === "GENERATE_CONTRACT") {
        // Get contact info
        const { data: contact } = await supabaseAdmin
          .from("contacts")
          .select("*")
          .eq("id", contactId)
          .single();

        if (!contact) continue;

        const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Client";
        const now = new Date();
        const docPrefix = action.type === "GENERATE_INVOICE" ? "F" : "C";
        const docType = action.type === "GENERATE_INVOICE" ? "facture" : "contrat";

        // Generate doc number
        const { count } = await supabaseAdmin
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("doc_type", docType);

        const docNumber = `${docPrefix}-2026-${String((count || 0) + 1).padStart(3, "0")}`;

        // Determine payment terms based on service
        let paymentTerms = "";
        if (action.service.includes("entretien")) {
          const firstPayment = Math.ceil(action.amount / 2);
          const secondPayment = action.amount - firstPayment;
          paymentTerms = `Versement 1: ${firstPayment}$ à la signature. Versement 2: ${secondPayment}$ mi-juillet 2026.`;
        } else {
          paymentTerms = `Paiement complet de ${action.amount}$ requis avant le service.`;
        }

        // Save document in DB
        const { data: doc } = await supabaseAdmin
          .from("documents")
          .insert({
            contact_id: contactId,
            doc_type: docType,
            doc_number: docNumber,
            amount: action.amount,
            status: "brouillon",
            data: {
              service: action.service,
              client_name: name,
              client_email: contact.email,
              client_phone: contact.phone,
              client_address: contact.address,
              payment_terms: paymentTerms,
              pool_type: contact.pool_type,
              generated_at: now.toISOString(),
            },
          })
          .select()
          .single();

        // If client has email, send document by email
        if (contact.email && doc) {
          await supabaseAdmin
            .from("documents")
            .update({ status: "envoyé" })
            .eq("id", doc.id);

          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";
          await fetch(`${baseUrl}/api/email/send-document`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              documentId: doc.id,
              contactId,
            }),
          });
        }

        // Update contact: services, season_price, stage
        const serviceLower = action.service.toLowerCase();
        const existingServices: string[] = Array.isArray(contact.services) ? contact.services : [];
        const newService = serviceLower.includes("ouverture")
          ? "ouverture"
          : serviceLower.includes("fermeture")
          ? "fermeture"
          : serviceLower.includes("entretien")
          ? "entretien"
          : null;

        const updatedServices = newService && !existingServices.includes(newService)
          ? [...existingServices, newService]
          : existingServices;

        await supabaseAdmin
          .from("contacts")
          .update({
            services: updatedServices,
            season_price: action.amount,
            stage: "closé",
          })
          .eq("id", contactId);

        console.log(`[ai-actions] Created ${docType} ${docNumber} for ${name}: ${action.amount}$`);
      } else if (action.type === "BOOK_JOB") {
        // Calculate time_end = time + 2h
        const [hours, minutes] = action.time.split(":").map(Number);
        const endHours = (hours + 2) % 24;
        const timeEnd = `${String(endHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

        await supabaseAdmin.from("jobs").insert({
          contact_id: contactId,
          job_type: action.jobType,
          scheduled_date: action.date,
          scheduled_time_start: action.time,
          scheduled_time_end: timeEnd,
          status: "confirmé",
        });

        console.log(`[ai-actions] Booked ${action.jobType} for ${action.date} at ${action.time}`);
      } else if (action.type === "REMINDER") {
        await supabaseAdmin.from("jobs").insert({
          contact_id: contactId,
          job_type: "autre",
          scheduled_date: action.date,
          scheduled_time_start: action.time,
          notes: action.description,
          status: "planifié",
        });

        console.log(`[ai-actions] Reminder set for ${action.date}: ${action.description}`);
      } else if (action.type === "ESCALATE") {
        // Get client info for the escalation message
        const { data: contact } = await supabaseAdmin
          .from("contacts")
          .select("first_name, last_name, phone")
          .eq("id", contactId)
          .single();

        const clientName = contact
          ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Inconnu"
          : "Inconnu";
        const clientPhone = contact?.phone || "?";

        // Find or create Thomas's contact
        const THOMAS_PHONE = "+14509942215";
        let { data: thomasContact } = await supabaseAdmin
          .from("contacts")
          .select("id")
          .eq("phone", THOMAS_PHONE)
          .maybeSingle();

        if (!thomasContact) {
          const { data: newContact } = await supabaseAdmin
            .from("contacts")
            .insert({ first_name: "Thomas", last_name: "(Admin)", phone: THOMAS_PHONE })
            .select("id")
            .single();
          thomasContact = newContact;
        }

        if (thomasContact) {
          const smsBody = `⚠️ CHLORE ESCALATION: ${clientName} (${clientPhone}) — ${action.description}`;
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";
          await fetch(`${baseUrl}/api/sms/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contactId: thomasContact.id, body: smsBody }),
          });
        }

        console.log(`[ai-actions] Escalated to Thomas: ${action.description}`);
      }
    } catch (err) {
      console.error("[ai-actions] Error executing action:", err);
    }
  }
}
