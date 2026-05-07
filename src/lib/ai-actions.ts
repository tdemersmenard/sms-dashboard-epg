import { supabaseAdmin } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import crypto from "crypto";

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
  startTime: string;
  endTime: string;
}

interface ModifyJobAction extends BaseAction {
  type: "MODIFY_JOB";
  oldDate: string;
  newDate: string;
  startTime: string;
  endTime: string;
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

interface CreatePaymentAction extends BaseAction {
  type: "CREATE_PAYMENT";
  amount: number;
  description: string;
}

interface CloseDealAction extends BaseAction {
  type: "CLOSE_DEAL";
  serviceType: string;
  amount: number;
}

type AIAction = GenerateInvoiceAction | GenerateContractAction | BookJobAction | ModifyJobAction | ReminderAction | NotifyThomasAction | UpdateStageAction | UpdateNotesAction | CreatePaymentAction | CloseDealAction;

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
        if (parts.length >= 4) {
          // format: {type}:{date_YYYY-MM-DD}:{heure_debut_HH:MM}:{heure_fin_HH:MM}
          // Note: HH:MM gets split again, so parts = [type, YYYY-MM-DD, HH, MM, HH, MM]
          // Actually the regex captures up to __ so HH:MM stays together — split on : gives 6 parts
          // parts[0]=type, parts[1]=YYYY-MM-DD (but date has dashes not colons, fine), wait...
          // __ACTION:BOOK_JOB:ouverture:2026-05-10:09:00:10:00__
          // actionParams = "ouverture:2026-05-10:09:00:10:00"
          // split(":") => ["ouverture", "2026-05-10", "09", "00", "10", "00"]
          const jobType = parts[0];
          const date = parts[1];
          const startTime = `${parts[2]}:${parts[3]}`;
          const endTime = `${parts[4]}:${parts[5]}`;
          actions.push({ type: "BOOK_JOB", jobType, date, startTime, endTime } as AIAction);
        }
        break;
      }
      case "MODIFY_JOB": {
        const parts = actionParams.split(":");
        if (parts.length >= 6) {
          // format: {oldDate_YYYY-MM-DD}:{newDate_YYYY-MM-DD}:{HH}:{MM}:{HH}:{MM}
          // actionParams = "2026-05-08:2026-05-10:09:00:10:00"
          // split(":") => ["2026-05-08", "2026-05-10", "09", "00", "10", "00"]
          const oldDate = parts[0];
          const newDate = parts[1];
          const startTime = `${parts[2]}:${parts[3]}`;
          const endTime = `${parts[4]}:${parts[5]}`;
          actions.push({ type: "MODIFY_JOB", oldDate, newDate, startTime, endTime } as AIAction);
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
      case "CREATE_PAYMENT": {
        const parts = actionParams.split(":");
        if (parts.length >= 2) {
          actions.push({
            type: "CREATE_PAYMENT",
            amount: parseInt(parts[0]),
            description: parts.slice(1).join(":"),
          } as AIAction);
        }
        break;
      }
      case "CLOSE_DEAL": {
        const parts = actionParams.split(":");
        if (parts.length >= 2) {
          actions.push({
            type: "CLOSE_DEAL",
            serviceType: parts[0],
            amount: parseInt(parts[1]),
          } as AIAction);
        }
        break;
      }
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
          // Anti-doublon: skip si un job du même type à la même date existe déjà
          const { data: existingBook } = await supabaseAdmin
            .from("jobs")
            .select("id")
            .eq("contact_id", contactId)
            .eq("job_type", action.jobType)
            .eq("scheduled_date", action.date)
            .limit(1);

          if (existingBook && existingBook.length > 0) {
            console.log(`[ai-actions] BOOK_JOB: job ${action.jobType} on ${action.date} already exists, skipping`);
            break;
          }

          await supabaseAdmin.from("jobs").insert({
            contact_id: contactId,
            job_type: action.jobType,
            scheduled_date: action.date,
            scheduled_time_start: action.startTime,
            scheduled_time_end: action.endTime,
            status: "confirmé",
          });

          // Mettre à jour ouverture_date si c'est une ouverture
          if (action.jobType === "ouverture" || action.jobType.includes("ouverture")) {
            await supabaseAdmin.from("contacts").update({ ouverture_date: action.date }).eq("id", contactId);
          }

          console.log(`[ai-actions] BOOK_JOB: ${action.jobType} on ${action.date} ${action.startTime}-${action.endTime}`);
          break;
        }

        case "MODIFY_JOB": {
          // Trouver le job à modifier (par date et contact)
          const { data: jobToModify } = await supabaseAdmin
            .from("jobs")
            .select("id, job_type")
            .eq("contact_id", contactId)
            .eq("scheduled_date", action.oldDate)
            .limit(1);

          if (!jobToModify || jobToModify.length === 0) {
            console.log(`[ai-actions] MODIFY_JOB: no job found on ${action.oldDate} for contact ${contactId}`);
            break;
          }

          await supabaseAdmin.from("jobs").update({
            scheduled_date: action.newDate,
            scheduled_time_start: action.startTime,
            scheduled_time_end: action.endTime,
          }).eq("id", jobToModify[0].id);

          // Mettre à jour ouverture_date si c'est une ouverture
          if (jobToModify[0].job_type === "ouverture" || jobToModify[0].job_type?.includes("ouverture")) {
            await supabaseAdmin.from("contacts").update({ ouverture_date: action.newDate }).eq("id", contactId);
          }

          console.log(`[ai-actions] MODIFY_JOB: moved job from ${action.oldDate} to ${action.newDate} ${action.startTime}-${action.endTime}`);
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
          const info = action.info;
          const updates: any = {};

          // Détecter et extraire les infos structurées
          const lowerInfo = info.toLowerCase();

          // Email
          const emailMatch = info.match(/[\w.-]+@[\w.-]+\.\w+/);
          if (emailMatch) updates.email = emailMatch[0].toLowerCase();

          // Nom (formats: "nom: X", "je m'appelle X", "mon nom est X", "moi c'est X")
          const namePatterns = [
            /nom\s*[:\-]\s*([a-zà-ÿ\s\-']+?)(?:[,.\n]|$)/i,
            /je m'?appelle\s+([a-zà-ÿ\s\-']+?)(?:[,.\n]|$)/i,
            /mon nom est\s+([a-zà-ÿ\s\-']+?)(?:[,.\n]|$)/i,
            /moi c'?est\s+([a-zà-ÿ\s\-']+?)(?:[,.\n]|$)/i,
            /^([a-zà-ÿ]+\s+[a-zà-ÿ]+)$/i,
          ];

          for (const pattern of namePatterns) {
            const match = info.match(pattern);
            if (match) {
              const fullName = match[1].trim();
              const parts = fullName.split(/\s+/);
              if (parts.length >= 2) {
                updates.first_name = parts[0];
                updates.last_name = parts.slice(1).join(" ");
              } else if (parts.length === 1) {
                updates.first_name = parts[0];
              }
              break;
            }
          }

          // Adresse (format: "adresse: X" ou contient un numéro civique)
          const addrPatterns = [
            /adresse\s*[:\-]\s*(.+?)(?:[,.\n]|$)/i,
            /j'?habite\s+(?:au\s+)?(.+?)(?:[,.\n]|$)/i,
            /(\d+\s+(?:rue|avenue|boulevard|chemin|rang|impasse|place|allée|côte|montée|route)\s+[a-zà-ÿ\s\-']+)/i,
          ];

          for (const pattern of addrPatterns) {
            const match = info.match(pattern);
            if (match && match[1].length > 5) {
              updates.address = match[1].trim();
              break;
            }
          }

          // Type de piscine
          if (lowerInfo.includes("hors-terre") || lowerInfo.includes("hors terre")) {
            updates.pool_type = "hors-terre";
          } else if (lowerInfo.includes("creusée") || lowerInfo.includes("creuse")) {
            updates.pool_type = "creusée";
          }

          // Date d'ouverture (formats variés)
          const datePatterns = [
            /(?:date|ouverture).*?(\d{4}-\d{2}-\d{2})/i,
            /(\d{4}-\d{2}-\d{2})/,
            /(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)/i,
            /(\d{1,2})\/(\d{1,2})\/?(\d{2,4})?/,
          ];

          const monthMap: Record<string, number> = {
            janvier: 1, février: 2, mars: 3, avril: 4, mai: 5, juin: 6,
            juillet: 7, août: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12,
          };

          for (const pattern of datePatterns) {
            const match = info.match(pattern);
            if (match) {
              let dateStr = "";
              if (match[1] && match[1].includes("-")) {
                dateStr = match[1];
              } else if (match[2] && monthMap[match[2].toLowerCase()]) {
                const day = parseInt(match[1]);
                const month = monthMap[match[2].toLowerCase()];
                dateStr = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              } else if (match[1] && match[2]) {
                const day = parseInt(match[1]);
                const month = parseInt(match[2]);
                if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
                  dateStr = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                }
              }
              if (dateStr && (info.toLowerCase().includes("ouverture") || info.toLowerCase().includes("date"))) {
                updates.ouverture_date = dateStr;
                break;
              }
            }
          }

          // Heure (formats: "à 10h", "10:30", "10h30", "à 8h00")
          const heurePatterns = [
            /(\d{1,2})\s*h\s*(\d{0,2})/i,
            /(\d{1,2}):(\d{2})/,
            /\bà\s+(\d{1,2})\s*h/i,
          ];

          let heureStr = "";
          for (const pattern of heurePatterns) {
            const match = info.match(pattern);
            if (match) {
              const h = parseInt(match[1]);
              const m = match[2] ? parseInt(match[2]) : 0;
              if (h >= 6 && h <= 20) {
                heureStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                break;
              }
            }
          }

          // Si on a une date d'ouverture ET une heure, créer/mettre à jour le job d'ouverture
          if (updates.ouverture_date) {
            const startTime = heureStr || "08:00";
            const [startH, startM] = startTime.split(":").map(Number);
            const endMinutes = startH * 60 + startM + 120; // +2h
            const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;

            const { data: existingOuverture } = await supabaseAdmin
              .from("jobs")
              .select("id")
              .eq("contact_id", contactId)
              .eq("job_type", "ouverture")
              .limit(1);

            if (existingOuverture && existingOuverture.length > 0) {
              await supabaseAdmin.from("jobs").update({
                scheduled_date: updates.ouverture_date,
                scheduled_time_start: startTime,
                scheduled_time_end: endTime,
              }).eq("id", existingOuverture[0].id);
            } else {
              await supabaseAdmin.from("jobs").insert({
                contact_id: contactId,
                job_type: "ouverture",
                scheduled_date: updates.ouverture_date,
                scheduled_time_start: startTime,
                scheduled_time_end: endTime,
                status: "planifié",
                notes: "Ouverture — planifiée par le bot",
              });
            }
          }

          // Si on a extrait des infos structurées, les sauver
          if (Object.keys(updates).length > 0) {
            await supabaseAdmin.from("contacts").update(updates).eq("id", contactId);
            console.log("[ai-actions] Updated contact fields:", Object.keys(updates));
          }

          // Toujours append dans les notes pour avoir l'historique
          const { data: contact } = await supabaseAdmin
            .from("contacts")
            .select("notes")
            .eq("id", contactId)
            .single();

          const existingNotes = contact?.notes || "";
          const newNotes = existingNotes ? existingNotes + "\n" + info : info;

          await supabaseAdmin.from("contacts").update({ notes: newNotes }).eq("id", contactId);
          console.log("[ai-actions] Notes updated:", info);
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

        case "CREATE_PAYMENT": {
          // Anti-doublon
          const { data: existing } = await supabaseAdmin
            .from("payments")
            .select("id")
            .eq("contact_id", contactId)
            .eq("amount", action.amount)
            .eq("status", "en_attente")
            .eq("notes", action.description)
            .limit(1);

          if (existing && existing.length > 0) {
            console.log("[ai-actions] Payment already exists, skipping");
            break;
          }

          const isSecondInstalment = action.description.toLowerCase().includes("2/2") || action.description.toLowerCase().includes("mi-juillet");
          const dueDate = isSecondInstalment
            ? "2026-07-15"
            : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

          await supabaseAdmin.from("payments").insert({
            contact_id: contactId,
            amount: action.amount,
            method: "interac",
            status: "en_attente",
            due_date: dueDate,
            notes: action.description,
          });

          // Notifier Thomas
          const { data: payContact } = await supabaseAdmin
            .from("contacts")
            .select("first_name, last_name")
            .eq("id", contactId)
            .single();

          const clientName = payContact ? [payContact.first_name, payContact.last_name].filter(Boolean).join(" ") : "Client";

          const { data: thomas } = await supabaseAdmin
            .from("contacts")
            .select("id")
            .eq("phone", "+14509942215")
            .single();

          if (thomas) {
            const { data: alreadyNotified } = await supabaseAdmin
              .from("automation_logs")
              .select("id")
              .eq("action", `payment_created_${contactId}_${action.amount}`)
              .limit(1);

            if (!alreadyNotified || alreadyNotified.length === 0) {
              await fetch(`${baseUrl}/api/sms/send`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contactId: thomas.id,
                  body: `CHLORE: Paiement créé — ${clientName}: ${action.amount}$ (${action.description})`,
                }),
              });

              await supabaseAdmin.from("automation_logs").insert({
                action: `payment_created_${contactId}_${action.amount}`,
                contact_id: contactId,
                status: "success",
              });
            }
          }

          console.log("[ai-actions] Payment created:", action.amount, action.description);
          break;
        }

        case "CLOSE_DEAL": {
          const { serviceType, amount } = action;

          // Mapping des types vers leurs propriétés
          const serviceMap: Record<string, { service: string; isEntretien: boolean; poolType: string | null; biweekly: boolean }> = {
            "entretien_hebdo": { service: "entretien hebdomadaire", isEntretien: true, poolType: null, biweekly: false },
            "entretien_2sem": { service: "entretien aux 2 semaines", isEntretien: true, poolType: null, biweekly: true },
            "ouverture": { service: "ouverture", isEntretien: false, poolType: null, biweekly: false },
            "package_ouv_ferm": { service: "package ouverture + fermeture", isEntretien: false, poolType: null, biweekly: false },
            "fermeture": { service: "fermeture", isEntretien: false, poolType: null, biweekly: false },
            // Legacy types (anciens clients)
            "entretien_hebdo_hors-terre": { service: "entretien hebdo hors-terre", isEntretien: true, poolType: "hors-terre", biweekly: false },
            "entretien_hebdo_creusée": { service: "entretien hebdo creusée", isEntretien: true, poolType: "creusée", biweekly: false },
            "entretien_2sem_hors-terre": { service: "entretien aux 2 semaines hors-terre", isEntretien: true, poolType: "hors-terre", biweekly: true },
            "entretien_2sem_creusée": { service: "entretien aux 2 semaines creusée", isEntretien: true, poolType: "creusée", biweekly: true },
            "ouverture_hors-terre": { service: "ouverture", isEntretien: false, poolType: "hors-terre", biweekly: false },
            "ouverture_creusee": { service: "ouverture", isEntretien: false, poolType: "creusée", biweekly: false },
            "fermeture_hors-terre": { service: "fermeture", isEntretien: false, poolType: "hors-terre", biweekly: false },
            "fermeture_creusee": { service: "fermeture", isEntretien: false, poolType: "creusée", biweekly: false },
            "spa": { service: "spa", isEntretien: true, poolType: null, biweekly: false },
          };

          const config = serviceMap[serviceType];
          if (!config) {
            console.log("[ai-actions] CLOSE_DEAL: type inconnu", serviceType);
            break;
          }

          // 1. Récupérer le contact
          const { data: contact } = await supabaseAdmin
            .from("contacts")
            .select("first_name, last_name, email, phone, services, address, portal_password")
            .eq("id", contactId)
            .single();

          if (!contact) break;

          // 2. Update les services + season_price + stage + pool_type
          const newServices = Array.from(new Set([...(contact.services || []), config.service]));
          const updates: any = {
            services: newServices,
            season_price: amount,
            stage: "closé",
          };
          if (config.poolType) updates.pool_type = config.poolType;

          await supabaseAdmin.from("contacts").update(updates).eq("id", contactId);
          console.log("[ai-actions] CLOSE_DEAL: contact updated", { serviceType, amount });

          // 3. Portail client (en premier — critique)
          if (contact.email && !contact.portal_password) {
            try {
              const tempPassword = Math.random().toString(36).slice(-8);
              const hash = await bcrypt.hash(tempPassword, 10);
              const token = crypto.randomBytes(32).toString("hex");
              const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

              await supabaseAdmin
                .from("contacts")
                .update({
                  portal_password: hash,
                  portal_token: token,
                  portal_token_expires: expires.toISOString(),
                })
                .eq("id", contactId);

              await fetch(`${baseUrl}/api/sms/send`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contactId,
                  body: `Votre portail client est prêt! Connectez-vous sur https://sms-dashboard-epg.vercel.app/portail avec:\nEmail: ${contact.email}\nMot de passe: ${tempPassword}\n\nVous pourrez y voir vos rendez-vous et paiements.`,
                }),
              });

              console.log("[ai-actions] CLOSE_DEAL: portal access sent directly");
            } catch (e) {
              console.error("[ai-actions] CLOSE_DEAL: portal error", e);
            }
          }

          // 4. Créer les paiements (insert direct, pas de fetch)
          if (config.isEntretien) {
            const half1 = Math.ceil(amount / 2);
            const half2 = amount - half1;

            const { data: existingPayments } = await supabaseAdmin
              .from("payments")
              .select("id")
              .eq("contact_id", contactId)
              .limit(1);

            if (!existingPayments || existingPayments.length === 0) {
              await supabaseAdmin.from("payments").insert([
                {
                  contact_id: contactId,
                  amount: half1,
                  method: "interac",
                  status: "en_attente",
                  due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
                  notes: `Versement 1/2 — ${config.service}`,
                },
                {
                  contact_id: contactId,
                  amount: half2,
                  method: "interac",
                  status: "en_attente",
                  due_date: "2026-07-15",
                  notes: `Versement 2/2 — ${config.service} (mi-juillet)`,
                },
              ]);
              console.log("[ai-actions] CLOSE_DEAL: 2 payments created for entretien");
            } else {
              console.log("[ai-actions] CLOSE_DEAL: payments already exist, skipping");
            }
          }

          if (!config.isEntretien) {
            const { data: existingPayments } = await supabaseAdmin
              .from("payments")
              .select("id")
              .eq("contact_id", contactId)
              .limit(1);

            if (!existingPayments || existingPayments.length === 0) {
              await supabaseAdmin.from("payments").insert({
                contact_id: contactId,
                amount,
                method: "interac",
                status: "en_attente",
                due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
                notes: config.service,
              });
              console.log("[ai-actions] CLOSE_DEAL: payment created for", config.service);
            } else {
              console.log("[ai-actions] CLOSE_DEAL: payment already exists, skipping");
            }
          }

          console.log("[ai-actions] CLOSE_DEAL: payments done (job created by BOOK_JOB)");

          // 5. Créer le contrat/facture
          try {
            const contractResp = await fetch(`${baseUrl}/api/documents/generate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contactId,
                type: "contrat",
                service: config.service,
                amount,
              }),
            });
            const contractText = await contractResp.text();
            let contractData: unknown = {};
            try {
              contractData = contractText ? JSON.parse(contractText) : {};
            } catch {
              console.error("[ai-actions] CLOSE_DEAL: contract response not JSON:", contractText.slice(0, 200));
            }
            console.log("[ai-actions] CLOSE_DEAL: contract created", contractData);
          } catch (e) {
            console.error("[ai-actions] CLOSE_DEAL: contract error", e);
          }

          // 6. Notifier Thomas (une seule fois)
          const { data: thomas } = await supabaseAdmin
            .from("contacts")
            .select("id")
            .eq("phone", "+14509942215")
            .single();

          if (thomas) {
            const clientName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Client";
            await fetch(`${baseUrl}/api/sms/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contactId: thomas.id,
                body: `CHLORE: ${clientName} a été closé pour ${amount}$ (${config.service}). Contrat + paiements + portail envoyés.`,
              }),
            });
          }

          break;
        }
      }
    } catch (err) {
      console.error(`[ai-actions] Error executing ${action.type}:`, err);
    }
  }
}
