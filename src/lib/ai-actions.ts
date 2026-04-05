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

interface UpdateNotesAction extends BaseAction {
  type: "UPDATE_NOTES";
  info: string;
}

type AIAction = GenerateInvoiceAction | GenerateContractAction | BookJobAction | ReminderAction | NotifyThomasAction | UpdateStageAction | UpdateNotesAction;

export function parseActions(aiResponse: string): { cleanMessage: string; actions: AIAction[] } {
  const actions: AIAction[] = [];

  // D'abord, extraire TOUTES les actions du texte complet (pas ligne par ligne)
  let cleanText = aiResponse;

  // Extraire toutes les actions avec un regex global
  const actionRegex = /__ACTION:([A-Z_]+):(.+?)__/g;
  let match;

  while ((match = actionRegex.exec(aiResponse)) !== null) {
    const actionType = match[1];
    const actionParams = match[2];

    // Enlever l'action du texte clean
    cleanText = cleanText.replace(match[0], "");

    switch (actionType) {
      case "NOTIFY_THOMAS":
        actions.push({ type: "NOTIFY_THOMAS", message: actionParams } as AIAction);
        break;
      case "BOOK_JOB": {
        const parts = actionParams.split(":");
        if (parts.length >= 3) {
          actions.push({ type: "BOOK_JOB", jobType: parts[0], date: parts[1], time: parts[2] } as AIAction);
        }
        break;
      }
      case "GENERATE_INVOICE": {
        const parts = actionParams.split(":");
        if (parts.length >= 2) {
          actions.push({ type: "GENERATE_INVOICE", service: parts.slice(0, -1).join(":"), amount: parseInt(parts[parts.length - 1]) } as AIAction);
        }
        break;
      }
      case "GENERATE_CONTRACT": {
        const parts = actionParams.split(":");
        if (parts.length >= 2) {
          actions.push({ type: "GENERATE_CONTRACT", service: parts.slice(0, -1).join(":"), amount: parseInt(parts[parts.length - 1]) } as AIAction);
        }
        break;
      }
      case "UPDATE_STAGE":
        actions.push({ type: "UPDATE_STAGE", stage: actionParams } as AIAction);
        break;
      case "REMINDER": {
        const parts = actionParams.split(":");
        if (parts.length >= 3) {
          actions.push({ type: "REMINDER", date: parts[0], time: parts[1], description: parts.slice(2).join(":") } as AIAction);
        }
        break;
      }
      case "UPDATE_NOTES":
        actions.push({ type: "UPDATE_NOTES", info: actionParams } as AIAction);
        break;
    }
  }

  // Enlever aussi __NO_REPLY__
  cleanText = cleanText.replace(/__NO_REPLY__/g, "");

  // Nettoyer le texte: enlever lignes vides multiples, trim
  cleanText = cleanText.replace(/\n{3,}/g, "\n\n").trim();

  console.log("[parseActions] Found actions:", actions.length, actions.map(a => a.type));
  console.log("[parseActions] Clean message length:", cleanText.length);

  return { cleanMessage: cleanText, actions };
}

export async function executeActions(actions: AIAction[], contactId: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";

  for (const action of actions) {
    try {
      switch (action.type) {

        case "NOTIFY_THOMAS": {
          // Anti-spam: check si on a déjà notifié Thomas pour ce client récemment
          const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
          const { data: recentNotif } = await supabaseAdmin
            .from("automation_logs")
            .select("id")
            .eq("action", "notify_thomas")
            .eq("contact_id", contactId)
            .gte("created_at", twoHoursAgo)
            .limit(1);

          if (recentNotif && recentNotif.length > 0) {
            console.log("[ai-actions] Skipping NOTIFY_THOMAS — already notified recently for this client");
            break;
          }

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

          // Log pour éviter les doublons
          await supabaseAdmin.from("automation_logs").insert({
            action: "notify_thomas",
            contact_id: contactId,
            status: "success",
            details: { message: action.message },
          });

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
          console.log("[ai-actions] === GENERATING INVOICE ===");
          console.log("[ai-actions] contactId:", contactId);
          console.log("[ai-actions] service:", action.service, "amount:", action.amount);

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

          // Extract email from recent inbound messages if not on contact
          let clientEmail = contact?.email || null;
          if (!clientEmail) {
            const { data: recentMsgs } = await supabaseAdmin
              .from("messages")
              .select("body")
              .eq("contact_id", contactId)
              .eq("direction", "inbound")
              .order("created_at", { ascending: false })
              .limit(10);
            for (const msg of recentMsgs || []) {
              const emailMatch = msg.body.match(/[\w.-]+@[\w.-]+\.\w+/);
              if (emailMatch) {
                clientEmail = emailMatch[0];
                await supabaseAdmin.from("contacts").update({ email: clientEmail }).eq("id", contactId);
                console.log("[ai-actions] Found email in messages:", clientEmail);
                break;
              }
            }
          }

          // Extract address from recent inbound messages if not on contact
          let clientAddress = contact?.address || null;
          if (!clientAddress) {
            const { data: recentMsgs } = await supabaseAdmin
              .from("messages")
              .select("body")
              .eq("contact_id", contactId)
              .eq("direction", "inbound")
              .order("created_at", { ascending: false })
              .limit(10);
            for (const msg of recentMsgs || []) {
              const addrMatch = msg.body.match(/\d+\s+(?:rue|chemin|boul|avenue|ch\.|rang|impasse|place|croissant).+/i);
              if (addrMatch) {
                clientAddress = addrMatch[0].trim();
                await supabaseAdmin.from("contacts").update({ address: clientAddress }).eq("id", contactId);
                console.log("[ai-actions] Found address in messages:", clientAddress);
                break;
              }
            }
          }

          const { data: doc, error: docError } = await supabaseAdmin.from("documents").insert({
            contact_id: contactId,
            doc_type: "facture",
            doc_number: docNumber,
            amount: action.amount,
            status: "brouillon",
            data: {
              service: action.service,
              client_name: contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") : "",
              client_email: clientEmail,
              client_phone: contact?.phone,
              client_address: clientAddress,
              payment_terms: `Paiement complet de ${action.amount}$ requis avant le service.`,
            },
          }).select().single();

          if (docError) {
            console.error("[ai-actions] INVOICE INSERT ERROR:", docError);
          } else {
            console.log("[ai-actions] INVOICE CREATED:", doc.doc_number, doc.id);
          }

          if (clientEmail && doc) {
            await supabaseAdmin.from("documents").update({ status: "envoyé" }).eq("id", doc.id);
            await fetch(`${baseUrl}/api/email/send-document`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ documentId: doc.id, contactId }),
            }).catch(err => console.error("[ai-actions] Email error:", err));
            console.log("[ai-actions] Invoice sent to:", clientEmail);

            // Notifier Thomas que la facture a été envoyée
            const { data: alreadyNotified } = await supabaseAdmin
              .from("automation_logs")
              .select("id")
              .eq("action", "invoice_sent_notif")
              .eq("contact_id", contactId)
              .limit(1);

            if (!alreadyNotified || alreadyNotified.length === 0) {
              const clientName = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "Client";
              let { data: thomas } = await supabaseAdmin
                .from("contacts")
                .select("id")
                .eq("phone", "+14509942215")
                .maybeSingle();

              if (thomas) {
                await fetch(`${baseUrl}/api/sms/send`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    contactId: thomas.id,
                    body: `CHLORE: Facture ${doc.doc_number} envoyée à ${clientName} (${clientEmail}) — ${action.service} ${action.amount}$`,
                  }),
                }).catch(err => console.error("[ai-actions] Thomas notif error:", err));
              }

              await supabaseAdmin.from("automation_logs").insert({
                action: "invoice_sent_notif",
                contact_id: contactId,
                status: "success",
                details: { doc_number: doc.doc_number, email: clientEmail },
              });
            }
          } else {
            console.log("[ai-actions] No email found — invoice stays as brouillon");
          }

          await supabaseAdmin.from("contacts").update({
            stage: "closé",
            season_price: action.amount,
          }).eq("id", contactId);

          break;
        }

        case "GENERATE_CONTRACT": {
          console.log("[ai-actions] === GENERATING CONTRACT ===");
          console.log("[ai-actions] contactId:", contactId);
          console.log("[ai-actions] service:", action.service, "amount:", action.amount);

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

          // Extract email from recent inbound messages if not on contact
          let clientEmail = contact?.email || null;
          if (!clientEmail) {
            const { data: recentMsgs } = await supabaseAdmin
              .from("messages")
              .select("body")
              .eq("contact_id", contactId)
              .eq("direction", "inbound")
              .order("created_at", { ascending: false })
              .limit(10);
            for (const msg of recentMsgs || []) {
              const emailMatch = msg.body.match(/[\w.-]+@[\w.-]+\.\w+/);
              if (emailMatch) {
                clientEmail = emailMatch[0];
                await supabaseAdmin.from("contacts").update({ email: clientEmail }).eq("id", contactId);
                console.log("[ai-actions] Found email in messages:", clientEmail);
                break;
              }
            }
          }

          // Extract address from recent inbound messages if not on contact
          let clientAddress = contact?.address || null;
          if (!clientAddress) {
            const { data: recentMsgs } = await supabaseAdmin
              .from("messages")
              .select("body")
              .eq("contact_id", contactId)
              .eq("direction", "inbound")
              .order("created_at", { ascending: false })
              .limit(10);
            for (const msg of recentMsgs || []) {
              const addrMatch = msg.body.match(/\d+\s+(?:rue|chemin|boul|avenue|ch\.|rang|impasse|place|croissant).+/i);
              if (addrMatch) {
                clientAddress = addrMatch[0].trim();
                await supabaseAdmin.from("contacts").update({ address: clientAddress }).eq("id", contactId);
                console.log("[ai-actions] Found address in messages:", clientAddress);
                break;
              }
            }
          }

          const firstPayment = Math.ceil(action.amount / 2);
          const secondPayment = action.amount - firstPayment;

          const { data: doc, error: docError } = await supabaseAdmin.from("documents").insert({
            contact_id: contactId,
            doc_type: "contrat",
            doc_number: docNumber,
            amount: action.amount,
            status: "brouillon",
            data: {
              service: action.service,
              client_name: contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") : "",
              client_email: clientEmail,
              client_phone: contact?.phone,
              client_address: clientAddress,
              payment_terms: `Versement 1: ${firstPayment}$ à la signature. Versement 2: ${secondPayment}$ mi-juillet 2026.`,
            },
          }).select().single();

          if (docError) {
            console.error("[ai-actions] CONTRACT INSERT ERROR:", docError);
          } else {
            console.log("[ai-actions] CONTRACT CREATED:", doc.doc_number, doc.id);
          }

          if (clientEmail && doc) {
            await supabaseAdmin.from("documents").update({ status: "envoyé" }).eq("id", doc.id);
            await fetch(`${baseUrl}/api/email/send-document`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ documentId: doc.id, contactId }),
            }).catch(err => console.error("[ai-actions] Email error:", err));
            console.log("[ai-actions] Contract sent to:", clientEmail);

            // Notifier Thomas que le contrat a été envoyé
            const { data: alreadyNotified } = await supabaseAdmin
              .from("automation_logs")
              .select("id")
              .eq("action", "invoice_sent_notif")
              .eq("contact_id", contactId)
              .limit(1);

            if (!alreadyNotified || alreadyNotified.length === 0) {
              const clientName = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "Client";
              let { data: thomas } = await supabaseAdmin
                .from("contacts")
                .select("id")
                .eq("phone", "+14509942215")
                .maybeSingle();

              if (thomas) {
                await fetch(`${baseUrl}/api/sms/send`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    contactId: thomas.id,
                    body: `CHLORE: Contrat ${doc.doc_number} envoyé à ${clientName} (${clientEmail}) — ${action.service} ${action.amount}$`,
                  }),
                }).catch(err => console.error("[ai-actions] Thomas notif error:", err));
              }

              await supabaseAdmin.from("automation_logs").insert({
                action: "invoice_sent_notif",
                contact_id: contactId,
                status: "success",
                details: { doc_number: doc.doc_number, email: clientEmail },
              });
            }
          } else {
            console.log("[ai-actions] No email found — contract stays as brouillon");
          }

          await supabaseAdmin.from("contacts").update({
            stage: "closé",
            season_price: action.amount,
          }).eq("id", contactId);

          break;
        }

        case "UPDATE_STAGE": {
          await supabaseAdmin.from("contacts").update({ stage: action.stage }).eq("id", contactId);
          console.log(`[ai-actions] Updated stage to ${action.stage}`);
          break;
        }

        case "UPDATE_NOTES": {
          const { data: contact } = await supabaseAdmin
            .from("contacts")
            .select("notes")
            .eq("id", contactId)
            .single();

          const existingNotes = contact?.notes || "";
          const newNotes = existingNotes
            ? existingNotes + "\n" + action.info
            : action.info;

          await supabaseAdmin.from("contacts")
            .update({ notes: newNotes })
            .eq("id", contactId);

          console.log("[ai-actions] Notes updated:", action.info);
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
