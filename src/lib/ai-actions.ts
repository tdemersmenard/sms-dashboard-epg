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

interface SetProfileAction extends BaseAction {
  type: "SET_PROFILE";
  profile: string;
}

// Profils d'acheteur valides — détectés par l'IA, adaptent le pitch (jamais le prix)
export const BUYER_PROFILES = ["presse", "prix", "analytique", "indecis", "relationnel"] as const;

// Planchers de prix (backstop en dur). Le bot peut donner un petit rabais de closing
// UNIQUEMENT sur l'entretien; aucun montant ne peut jamais descendre sous ces valeurs.
// Ouverture/fermeture/package/spa = prix fermes (le plancher = le prix de liste).
export const PRICE_FLOORS: Record<string, number> = {
  entretien_hebdo: 1399,
  entretien_2sem: 997,
  // variantes legacy (hors-terre / creusée)
  "entretien_hebdo_hors-terre": 1399,
  "entretien_hebdo_creusée": 1399,
  "entretien_2sem_hors-terre": 997,
  "entretien_2sem_creusée": 997,
  // services fermes — aucun rabais
  ouverture: 249,
  "ouverture_hors-terre": 249,
  ouverture_creusee: 249,
  fermeture: 200, // type de piscine inconnu → plancher = prix hors-terre
  "fermeture_hors-terre": 200,
  fermeture_creusee: 250,
  package_ouv_ferm: 450,
  spa: 500,
};

type AIAction = GenerateInvoiceAction | GenerateContractAction | BookJobAction | ModifyJobAction | ReminderAction | NotifyThomasAction | UpdateStageAction | UpdateNotesAction | CreatePaymentAction | CloseDealAction | SetProfileAction;

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
        // Format attendu: {type}:{YYYY-MM-DD}:{HH:MM}:{HH:MM}
        // Parsing tolérant: espaces, "10h"/"10h30", heure de fin manquante (→ début + 60 min).
        const parts = actionParams.split(":").map(p => p.trim());
        if (parts.length >= 2) {
          const jobType = parts[0].toLowerCase();
          const date = parts[1];
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            console.error(`[parseActions] BOOK_JOB: date invalide "${date}" — action ignorée`);
            break;
          }
          // Extraire toutes les heures du reste des params ("10:00:11:00", "10h30", "10h à 11h"...)
          const rest = parts.slice(2).join(":");
          const timeTokens: { h: number; m: number }[] = [];
          const timeRegex = /(\d{1,2})\s*[h:]\s*(\d{2})?/g;
          let tm;
          while ((tm = timeRegex.exec(rest)) !== null) {
            const h = parseInt(tm[1]);
            const m = tm[2] !== undefined ? parseInt(tm[2]) : 0;
            if (h >= 0 && h <= 23 && m >= 0 && m <= 59) timeTokens.push({ h, m });
          }
          if (timeTokens.length === 0) {
            console.error(`[parseActions] BOOK_JOB: aucune heure valide dans "${rest}" — action ignorée`);
            break;
          }
          const fmt = (t: { h: number; m: number }) => `${String(t.h).padStart(2, "0")}:${String(t.m).padStart(2, "0")}`;
          const startTime = fmt(timeTokens[0]);
          // Heure de fin: 2e token si présent et après le début, sinon début + 60 min
          let endTime: string;
          const startMin = timeTokens[0].h * 60 + timeTokens[0].m;
          if (timeTokens.length >= 2 && timeTokens[1].h * 60 + timeTokens[1].m > startMin) {
            endTime = fmt(timeTokens[1]);
          } else {
            const endMin = startMin + 60;
            endTime = `${String(Math.floor(endMin / 60) % 24).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
          }
          actions.push({ type: "BOOK_JOB", jobType, date, startTime, endTime } as AIAction);
        }
        break;
      }
      case "MODIFY_JOB": {
        const parts = actionParams.split(":");
        if (parts.length >= 6) {
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
      case "SET_PROFILE": {
        const p = actionParams.trim().toLowerCase();
        if ((BUYER_PROFILES as readonly string[]).includes(p)) {
          actions.push({ type: "SET_PROFILE", profile: p } as AIAction);
        }
        break;
      }
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

/**
 * Helper: get the franchise owner's contact id for sending notifications.
 * Looks up the contact's franchise, then the franchise's owner_phone,
 * then finds or creates a contact for that owner in that franchise.
 */
async function getOwnerForContact(contactId: string): Promise<{ ownerId: string; franchiseId: string } | null> {
  const { data: contactData } = await supabaseAdmin
    .from("contacts")
    .select("franchise_id")
    .eq("id", contactId)
    .single();

  const fId = contactData?.franchise_id;
  if (!fId) return null;

  const { data: franchise } = await supabaseAdmin
    .from("franchises")
    .select("owner_phone")
    .eq("id", fId)
    .single();

  if (!franchise?.owner_phone) return null;

  // Find or create owner contact in this franchise
  let { data: owner } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("phone", franchise.owner_phone)
    .eq("franchise_id", fId)
    .maybeSingle();

  if (!owner) {
    const { data: newOwner } = await supabaseAdmin
      .from("contacts")
      .insert({
        first_name: "Propriétaire",
        phone: franchise.owner_phone,
        franchise_id: fId,
        stage: "complété",
      })
      .select("id")
      .single();
    owner = newOwner;
  }

  if (!owner) return null;
  return { ownerId: owner.id, franchiseId: fId };
}

export async function executeActions(actions: AIAction[], contactId: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";

  for (const action of actions) {
    try {
      switch (action.type) {

        case "NOTIFY_THOMAS": {
          // Anti-spam: check si on a déjà notifié le propriétaire pour ce client récemment.
          // On ne compte que les notifications réellement ENVOYÉES (status success) —
          // un échec (ex: owner_phone manquant) ne doit pas supprimer les tentatives suivantes.
          const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
          const { data: recentNotif } = await supabaseAdmin
            .from("automation_logs")
            .select("id")
            .eq("action", "notify_thomas")
            .eq("status", "success")
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

          const ownerInfo = await getOwnerForContact(contactId);

          // Le log reflète la RÉALITÉ de l'envoi: "success" seulement si le SMS est parti.
          // Avant, on loggait "success" même sans owner_phone — les notifications mouraient
          // en silence et les logs cachaient le problème.
          let notifSent = false;
          let notifFailReason = "owner_phone manquant sur la franchise";
          if (ownerInfo) {
            const notification = `CHLORE: ${clientName} (${clientPhone}) — ${action.message}`;
            try {
              const resp = await fetch(`${baseUrl}/api/sms/send`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contactId: ownerInfo.ownerId, body: notification }),
              });
              notifSent = resp.ok;
              if (!resp.ok) notifFailReason = `sms/send HTTP ${resp.status}`;
            } catch (e) {
              notifFailReason = `sms/send error: ${e instanceof Error ? e.message : "unknown"}`;
            }
          }

          await supabaseAdmin.from("automation_logs").insert({
            action: "notify_thomas",
            contact_id: contactId,
            status: notifSent ? "success" : "failed",
            details: notifSent ? { message: action.message } : { message: action.message, reason: notifFailReason },
            ...(ownerInfo ? { franchise_id: ownerInfo.franchiseId } : {}),
          });

          if (notifSent) {
            console.log(`[ai-actions] Notified owner: ${action.message}`);
          } else {
            console.error(`[ai-actions] NOTIFY_THOMAS FAILED (${notifFailReason}): ${action.message}`);
          }
          break;
        }

        case "BOOK_JOB": {
          // Chaque tentative est loggée dans automation_logs (succès/échec + raison) pour debug.
          const { data: contactForJob } = await supabaseAdmin
            .from("contacts")
            .select("franchise_id, assigned_employee_id, first_name, last_name")
            .eq("id", contactId)
            .single();
          const jobFranchiseId = contactForJob?.franchise_id ?? null;

          const logBook = async (status: string, reason: string, extra: Record<string, unknown> = {}) => {
            await supabaseAdmin.from("automation_logs").insert({
              action: "book_job",
              contact_id: contactId,
              status,
              details: { jobType: action.jobType, date: action.date, start: action.startTime, end: action.endTime, reason, ...extra },
              ...(jobFranchiseId ? { franchise_id: jobFranchiseId } : {}),
            }).then(({ error }) => { if (error) console.error("[ai-actions] BOOK_JOB log error:", error.message); });
          };

          // Validation: pas de booking dans le passé
          const todayMtl = new Date().toLocaleDateString("en-CA", { timeZone: "America/Montreal" });
          if (action.date < todayMtl) {
            console.error(`[ai-actions] BOOK_JOB: date passée ${action.date}, refusé`);
            await logBook("failed", "date_passee");
            break;
          }

          // Anti-doublon: skip si un job actif du même type à la même date existe déjà
          const { data: existingBook } = await supabaseAdmin
            .from("jobs")
            .select("id")
            .eq("contact_id", contactId)
            .eq("job_type", action.jobType)
            .eq("scheduled_date", action.date)
            .neq("status", "annulé")
            .limit(1);

          if (existingBook && existingBook.length > 0) {
            console.log(`[ai-actions] BOOK_JOB: job ${action.jobType} on ${action.date} already exists, skipping`);
            await logBook("skipped", "doublon_meme_type_meme_date", { existingJobId: existingBook[0].id });
            break;
          }

          // Anti-conflit: le créneau doit être libre dans la franchise (chevauchement horaire)
          const overlapQuery = () => supabaseAdmin
            .from("jobs")
            .select("id, contact_id, created_at")
            .eq("scheduled_date", action.date)
            .neq("status", "annulé")
            .lt("scheduled_time_start", action.endTime)
            .gt("scheduled_time_end", action.startTime)
            .eq("franchise_id", jobFranchiseId ?? "00000000-0000-0000-0000-000000000001");

          const notifySlotTaken = async () => {
            await fetch(`${baseUrl}/api/sms/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contactId,
                body: `Oh! Ce créneau vient tout juste d'être réservé par un autre client. Dites-moi quelles autres disponibilités vous conviendraient et je vous propose de nouveaux créneaux!`,
              }),
            }).catch(e => console.error("[ai-actions] BOOK_JOB conflict SMS error:", e));
          };

          const { data: conflicts } = await overlapQuery();
          if (conflicts && conflicts.length > 0) {
            console.warn(`[ai-actions] BOOK_JOB: créneau ${action.date} ${action.startTime} déjà pris (${conflicts.length} conflit(s))`);
            await logBook("failed", "creneau_deja_pris", { conflictJobIds: conflicts.map(c => c.id) });
            await notifySlotTaken();
            break;
          }

          const { data: insertedJob, error: insertErr } = await supabaseAdmin.from("jobs").insert({
            contact_id: contactId,
            job_type: action.jobType,
            scheduled_date: action.date,
            scheduled_time_start: action.startTime,
            scheduled_time_end: action.endTime,
            status: "confirmé",
            ...(jobFranchiseId ? { franchise_id: jobFranchiseId } : {}),
            ...(contactForJob?.assigned_employee_id ? { assigned_employee_id: contactForJob.assigned_employee_id } : {}),
          }).select("id, created_at").single();

          if (insertErr || !insertedJob) {
            console.error("[ai-actions] BOOK_JOB: insert failed:", insertErr?.message);
            await logBook("failed", "insert_error", { error: insertErr?.message });
            break;
          }

          // Vérification post-insert (course entre 2 clients qui répondent en même temps):
          // si un autre job chevauchant a été créé AVANT le nôtre, on cède le créneau.
          const { data: postConflicts } = await overlapQuery().neq("id", insertedJob.id);
          const lostRace = (postConflicts || []).some(c => c.created_at <= insertedJob.created_at);
          if (lostRace) {
            await supabaseAdmin.from("jobs").delete().eq("id", insertedJob.id);
            console.warn(`[ai-actions] BOOK_JOB: course perdue sur ${action.date} ${action.startTime}, job retiré`);
            await logBook("failed", "course_perdue_creneau", { conflictJobIds: (postConflicts || []).map(c => c.id) });
            await notifySlotTaken();
            break;
          }

          // Mettre à jour ouverture_date si c'est une ouverture
          if (action.jobType === "ouverture" || action.jobType.includes("ouverture")) {
            await supabaseAdmin.from("contacts").update({ ouverture_date: action.date }).eq("id", contactId);
          }

          await logBook("success", "job_cree", { jobId: insertedJob.id });
          console.log(`[ai-actions] BOOK_JOB: ${action.jobType} on ${action.date} ${action.startTime}-${action.endTime} (job ${insertedJob.id})`);
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

            // Notifier le propriétaire que la facture a été envoyée
            const { data: alreadyNotified } = await supabaseAdmin
              .from("automation_logs")
              .select("id")
              .eq("action", "invoice_sent_notif")
              .eq("contact_id", contactId)
              .limit(1);

            if (!alreadyNotified || alreadyNotified.length === 0) {
              const clientName = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "Client";
              const ownerInfo = await getOwnerForContact(contactId);

              if (ownerInfo) {
                await fetch(`${baseUrl}/api/sms/send`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    contactId: ownerInfo.ownerId,
                    body: `CHLORE: Facture ${doc.doc_number} envoyée à ${clientName} (${clientEmail}) — ${action.service} ${action.amount}$`,
                  }),
                }).catch(err => console.error("[ai-actions] Owner notif error:", err));
              }

              await supabaseAdmin.from("automation_logs").insert({
                action: "invoice_sent_notif",
                contact_id: contactId,
                status: "success",
                details: { doc_number: doc.doc_number, email: clientEmail },
                ...(ownerInfo ? { franchise_id: ownerInfo.franchiseId } : {}),
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

            // Notifier le propriétaire que le contrat a été envoyé
            const { data: alreadyNotified } = await supabaseAdmin
              .from("automation_logs")
              .select("id")
              .eq("action", "invoice_sent_notif")
              .eq("contact_id", contactId)
              .limit(1);

            if (!alreadyNotified || alreadyNotified.length === 0) {
              const clientName = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "Client";
              const ownerInfo = await getOwnerForContact(contactId);

              if (ownerInfo) {
                await fetch(`${baseUrl}/api/sms/send`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    contactId: ownerInfo.ownerId,
                    body: `CHLORE: Contrat ${doc.doc_number} envoyé à ${clientName} (${clientEmail}) — ${action.service} ${action.amount}$`,
                  }),
                }).catch(err => console.error("[ai-actions] Owner notif error:", err));
              }

              await supabaseAdmin.from("automation_logs").insert({
                action: "invoice_sent_notif",
                contact_id: contactId,
                status: "success",
                details: { doc_number: doc.doc_number, email: clientEmail },
                ...(ownerInfo ? { franchise_id: ownerInfo.franchiseId } : {}),
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

        case "SET_PROFILE": {
          // Le profil adapte le pitch, JAMAIS le prix. Scopé par la ligne contact (franchise).
          if ((BUYER_PROFILES as readonly string[]).includes(action.profile)) {
            await supabaseAdmin.from("contacts").update({ buyer_profile: action.profile }).eq("id", contactId);
            console.log(`[ai-actions] Buyer profile set to ${action.profile}`);
          }
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
              const { data: cEmp } = await supabaseAdmin.from("contacts").select("assigned_employee_id").eq("id", contactId).single();
              await supabaseAdmin.from("jobs").insert({
                contact_id: contactId,
                job_type: "ouverture",
                scheduled_date: updates.ouverture_date,
                scheduled_time_start: startTime,
                scheduled_time_end: endTime,
                status: "planifié",
                notes: "Ouverture — planifiée par le bot",
                ...(cEmp?.assigned_employee_id ? { assigned_employee_id: cEmp.assigned_employee_id } : {}),
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

          // Notifier le propriétaire
          const { data: payContact } = await supabaseAdmin
            .from("contacts")
            .select("first_name, last_name")
            .eq("id", contactId)
            .single();

          const clientName = payContact ? [payContact.first_name, payContact.last_name].filter(Boolean).join(" ") : "Client";

          const ownerInfo = await getOwnerForContact(contactId);

          if (ownerInfo) {
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
                  contactId: ownerInfo.ownerId,
                  body: `CHLORE: Paiement créé — ${clientName}: ${action.amount}$ (${action.description})`,
                }),
              });

              await supabaseAdmin.from("automation_logs").insert({
                action: `payment_created_${contactId}_${action.amount}`,
                contact_id: contactId,
                status: "success",
                franchise_id: ownerInfo.franchiseId,
              });
            }
          }

          console.log("[ai-actions] Payment created:", action.amount, action.description);
          break;
        }

        case "CLOSE_DEAL": {
          const { serviceType } = action;
          let amount = action.amount;

          // Backstop plancher: jamais closer sous le minimum. Si le bot tente un montant
          // trop bas (rabais hors politique), on remonte au plancher et on prévient Thomas.
          const floor = PRICE_FLOORS[serviceType];
          if (floor !== undefined && amount < floor) {
            console.warn(`[ai-actions] CLOSE_DEAL: montant ${amount}$ sous le plancher ${floor}$ pour ${serviceType} — remonté au plancher`);
            const belowFloor = amount;
            amount = floor;
            try {
              const { data: fc } = await supabaseAdmin
                .from("contacts").select("first_name, last_name").eq("id", contactId).single();
              const cn = fc ? [fc.first_name, fc.last_name].filter(Boolean).join(" ") : "Client";
              const oi = await getOwnerForContact(contactId);
              if (oi) {
                await fetch(`${baseUrl}/api/sms/send`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    contactId: oi.ownerId,
                    body: `CHLORE ⚠️: le bot a tenté de closer ${cn} à ${belowFloor}$ (sous le plancher ${floor}$ pour ${serviceType}). J'ai remonté au plancher ${floor}$. Vérifie la conversation SMS au cas où il aurait quoté ${belowFloor}$ au client.`,
                  }),
                }).catch(() => {});
              }
            } catch (e) {
              console.error("[ai-actions] CLOSE_DEAL floor notify error:", e);
            }
          }

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
            .select("first_name, last_name, email, phone, services, address, portal_password, assigned_employee_id, franchise_id")
            .eq("id", contactId)
            .single();

          if (!contact) break;

          // 2. Update les services + season_price + stage + pool_type
          const alreadyHasService = (contact.services || []).includes(config.service);
          const newServices = Array.from(new Set([...(contact.services || []), config.service]));
          // Client existant qui AJOUTE un service (ex: fermeture 200$ après une ouverture):
          // on additionne au prix de saison au lieu d'écraser.
          const hadServices = (contact.services || []).length > 0;
          const { data: priceRow } = await supabaseAdmin
            .from("contacts").select("season_price").eq("id", contactId).single();
          const newSeasonPrice = hadServices && !alreadyHasService && priceRow?.season_price
            ? Number(priceRow.season_price) + amount
            : amount;
          const updates: any = {
            services: newServices,
            season_price: newSeasonPrice,
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
                  body: `Votre portail client est prêt! Connectez-vous sur ${baseUrl}/portail avec:\nEmail: ${contact.email}\nMot de passe: ${tempPassword}\n\nVous pourrez y voir vos rendez-vous et paiements.`,
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
                  ...(contact.franchise_id ? { franchise_id: contact.franchise_id } : {}),
                },
                {
                  contact_id: contactId,
                  amount: half2,
                  method: "interac",
                  status: "en_attente",
                  due_date: "2026-07-15",
                  notes: `Versement 2/2 — ${config.service} (mi-juillet)`,
                  ...(contact.franchise_id ? { franchise_id: contact.franchise_id } : {}),
                },
              ]);
              console.log("[ai-actions] CLOSE_DEAL: 2 payments created for entretien");
            } else {
              console.log("[ai-actions] CLOSE_DEAL: payments already exist, skipping");
            }
          }

          if (!config.isEntretien) {
            // Anti-doublon PAR SERVICE (pas "n'importe quel paiement"): un client ouverture-seule
            // qui achète sa fermeture a déjà un paiement d'ouverture — il faut quand même créer
            // celui de la fermeture, mais jamais deux fois le même service.
            const { data: existingPayments } = await supabaseAdmin
              .from("payments")
              .select("id")
              .eq("contact_id", contactId)
              .ilike("notes", `%${config.service}%`)
              .limit(1);

            if (!existingPayments || existingPayments.length === 0) {
              await supabaseAdmin.from("payments").insert({
                contact_id: contactId,
                amount,
                method: "interac",
                status: "en_attente",
                due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
                notes: config.service,
                ...(contact.franchise_id ? { franchise_id: contact.franchise_id } : {}),
              });
              console.log("[ai-actions] CLOSE_DEAL: payment created for", config.service);
            } else {
              console.log("[ai-actions] CLOSE_DEAL: payment already exists for this service, skipping");
            }
          }

          console.log("[ai-actions] CLOSE_DEAL: payments done");

          // 5. Créer le job automatiquement (ouvertures/fermetures) — fallback si BOOK_JOB n'a pas été appelé
          if (!config.isEntretien) {
            try {
              // Chercher la date dans les messages (bot + client)
              const { data: recentMsgs } = await supabaseAdmin
                .from("messages")
                .select("body, direction")
                .eq("contact_id", contactId)
                .order("created_at", { ascending: false })
                .limit(30);

              let jobDate: string | null = null;
              let jobTimeStart = "08:00";
              let jobTimeEnd = "09:00";

              for (const msg of recentMsgs || []) {
                // Pattern: "samedi 10 mai", "jeudi 7 mai", etc.
                const dateMatch = msg.body.match(/(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)/i);
                if (dateMatch && !jobDate) {
                  const day = parseInt(dateMatch[1]);
                  const monthNames: Record<string, number> = {
                    janvier: 0, février: 1, mars: 2, avril: 3, mai: 4, juin: 5,
                    juillet: 6, août: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11,
                  };
                  const month = monthNames[dateMatch[2].toLowerCase()];
                  if (month !== undefined) {
                    const year = new Date().getFullYear();
                    jobDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  }
                }
                // Pattern heure: "de 9h30 à 10h30", "de 14h à 15h"
                const timeMatch = msg.body.match(/(?:de\s+)?(\d{1,2})[h:](\d{0,2})\s*(?:à|a|-)\s*(\d{1,2})[h:]?(\d{0,2})?/i);
                if (timeMatch && jobTimeStart === "08:00") {
                  jobTimeStart = `${timeMatch[1].padStart(2, "0")}:${(timeMatch[2] || "00").padStart(2, "0")}`;
                  jobTimeEnd = `${timeMatch[3].padStart(2, "0")}:${(timeMatch[4] || "00").padStart(2, "0")}`;
                }
              }

              if (jobDate) {
                const jobType = config.service.includes("fermeture") ? "fermeture" : "ouverture";

                // Anti-doublon
                const { data: existingJob } = await supabaseAdmin
                  .from("jobs")
                  .select("id")
                  .eq("contact_id", contactId)
                  .eq("job_type", jobType)
                  .eq("scheduled_date", jobDate)
                  .limit(1);

                if (!existingJob || existingJob.length === 0) {
                  await supabaseAdmin.from("jobs").insert({
                    contact_id: contactId,
                    job_type: jobType,
                    scheduled_date: jobDate,
                    scheduled_time_start: jobTimeStart,
                    scheduled_time_end: jobTimeEnd,
                    status: "planifié",
                    ...(contact.franchise_id ? { franchise_id: contact.franchise_id } : {}),
                    ...(contact?.assigned_employee_id ? { assigned_employee_id: contact.assigned_employee_id } : {}),
                  });

                  if (jobType === "ouverture") {
                    await supabaseAdmin.from("contacts").update({ ouverture_date: jobDate }).eq("id", contactId);
                  }
                  console.log(`[ai-actions] CLOSE_DEAL: job ${jobType} created for ${jobDate} ${jobTimeStart}-${jobTimeEnd}`);
                } else {
                  console.log(`[ai-actions] CLOSE_DEAL: job already exists for ${jobDate}`);
                }
              } else {
                console.log("[ai-actions] CLOSE_DEAL: could not parse date from messages");
                // Notifier le propriétaire qu'il faut ajouter la date manuellement
                const ownerInfo = await getOwnerForContact(contactId);
                if (ownerInfo) {
                  const clientName = contact ? `${contact.first_name} ${contact.last_name || ""}`.trim() : "Client";
                  await fetch(`${baseUrl}/api/sms/send`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      contactId: ownerInfo.ownerId,
                      body: `CHLORE: ${clientName} a été closé mais je n'ai pas pu trouver la date du RDV dans la conversation. Va sur le calendrier pour l'ajouter manuellement.`,
                    }),
                  });
                }
              }
            } catch (jobErr) {
              console.error("[ai-actions] CLOSE_DEAL: job creation error:", jobErr);
            }
          }

          // 6. (Retiré) L'ancien appel à /api/documents/generate pointait vers une route
          // inexistante (404 systématique) — le contrat n'a jamais été généré par ce chemin.
          // La facture/contrat se crée manuellement depuis le dashboard pour l'instant.

          // 7. Notifier le propriétaire (une seule fois). Un échec est loggé "failed"
          // pour rester visible — jamais d'échec silencieux sur une notif de closing.
          const ownerInfo = await getOwnerForContact(contactId);
          const closeClientName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Client";

          if (ownerInfo) {
            await fetch(`${baseUrl}/api/sms/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contactId: ownerInfo.ownerId,
                body: `CHLORE: ${closeClientName} a été closé pour ${amount}$ (${config.service}). Paiement(s) + portail créés. Pense à générer la facture depuis le dashboard.`,
              }),
            });
          } else {
            console.error(`[ai-actions] CLOSE_DEAL: notification owner impossible (owner_phone manquant) pour ${closeClientName}`);
            await supabaseAdmin.from("automation_logs").insert({
              action: "close_deal_notify",
              contact_id: contactId,
              status: "failed",
              details: { reason: "owner_phone manquant sur la franchise", client: closeClientName, amount, service: config.service },
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
