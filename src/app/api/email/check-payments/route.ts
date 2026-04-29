export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getAuthedGmail } from "@/lib/google";

export async function GET() {
  try {
    const gmail = await getAuthedGmail();

    // Search for Interac e-Transfer notification emails from last 24h
    const oneDayAgo = Math.floor((Date.now() - 86400000) / 1000);
    const { data: messagesData } = await gmail.users.messages.list({
      userId: "me",
      q: `from:notify@payments.interac.ca after:${oneDayAgo}`,
      maxResults: 20,
    });

    const gmailMessages = messagesData?.messages || [];
    const processed: string[] = [];

    for (const msg of gmailMessages) {
      const { data: fullMsg } = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "full",
      });

      const headers = fullMsg?.payload?.headers || [];
      const subject = headers.find((h) => h.name === "Subject")?.value || "";
      const msgId = fullMsg?.id || "";

      // Anti-doublon: skip si déjà scanné (peu importe le status)
      const { data: existingLog } = await supabaseAdmin
        .from("automation_logs")
        .select("id")
        .eq("action", `interac_scan_${msgId}`)
        .limit(1);
      if (existingLog && existingLog.length > 0) continue;

      // Parse amount and sender name from subject
      // e.g. "INTERAC e-Transfer: John Doe sent you $250.00"
      // or French: "Virement INTERAC : Jean Tremblay vous a envoyé 250,00 $"
      // Match les montants avec espaces, virgules, points
      // Ex: "1 000,00 $", "1,000.00", "$1000", "1000,00 $"
      const amountMatch = subject.match(/(\d{1,3}(?:[\s,]\d{3})*(?:[.,]\d{1,2})?)\s*\$?/);
      const nameMatch =
        subject.match(/(?:from|de)\s+(.+?)(?:\s+sent|\s+vous|\s*$)/i) ||
        subject.match(/:\s*(.+?)\s+(?:sent|vous)/i);

      if (!amountMatch) continue;

      // Nettoyer: enlever espaces, remplacer virgule par point
      const cleanAmount = amountMatch[1]
        .replace(/\s/g, "") // enlever tous les espaces
        .replace(/,(\d{2})$/, ".$1") // virgule décimale → point
        .replace(/,/g, ""); // enlever les virgules de milliers
      const amount = parseFloat(cleanAmount);
      const senderName = nameMatch?.[1]?.trim() || "Inconnu";

      // Si le nom de l'expéditeur contient "Thomas Demers" ou "Thomas Menard", c'est un transfert interne
      // (pas un paiement client) — skip
      const senderLower = (senderName || subject || "").toLowerCase();
      if (senderLower.includes("thomas demers") || senderLower.includes("thomas menard") || senderLower.includes("thomas dm")) {
        console.log("[check-payments] Virement interne détecté, skip:", senderName);

        await supabaseAdmin.from("automation_logs").insert({
          action: `interac_scan_${msgId}`,
          status: "skipped_internal_transfer",
        });

        continue;
      }

      // Try to match with a contact by name
      const nameParts = senderName.toLowerCase().split(" ");
      let matchedContact = null;

      if (nameParts.length >= 2) {
        const { data: contacts } = await supabaseAdmin
          .from("contacts")
          .select("id, first_name, last_name, phone, season_price")
          .or(
            `first_name.ilike.%${nameParts[0]}%,last_name.ilike.%${nameParts[nameParts.length - 1]}%`
          );

        if (contacts && contacts.length > 0) {
          matchedContact =
            contacts.find((c) => {
              const fullName = `${c.first_name} ${c.last_name}`.toLowerCase();
              return (
                fullName.includes(nameParts[0]) &&
                fullName.includes(nameParts[nameParts.length - 1])
              );
            }) || contacts[0];
        }
      }

if (matchedContact) {
  // Chercher un payment en_attente avec un montant qui matche
  const { data: pendingPayments } = await supabaseAdmin
    .from("payments")
    .select("id, amount, notes")
    .eq("contact_id", matchedContact.id)
    .eq("status", "en_attente")
    .order("due_date", { ascending: true });

  // Trouver le payment qui matche le montant exact
  const matchingPayment = (pendingPayments || []).find(p => Math.abs(parseFloat(p.amount) - amount) < 0.01);

  if (matchingPayment) {
    // Marquer le payment existant comme reçu
    await supabaseAdmin
      .from("payments")
      .update({
        status: "reçu",
        method: "interac",
        received_date: new Date().toISOString().split("T")[0],
      })
      .eq("id", matchingPayment.id);

    processed.push(`${senderName}: ${amount}$ → ${matchedContact.first_name} ${matchedContact.last_name} (matched: ${matchingPayment.notes})`);

    // Anti-doublon: marquer cet email comme traité IMMÉDIATEMENT
    await supabaseAdmin.from("automation_logs").insert({
      action: `interac_scan_${msgId}`,
      status: "matched",
      contact_id: matchedContact.id,
      details: { sender: senderName, amount, payment_id: matchingPayment.id, notes: matchingPayment.notes },
    });

    // Auto-créer le job si c'est une ouverture/fermeture et qu'il n'y a pas encore de job
    try {
      const { data: contact } = await supabaseAdmin
        .from("contacts")
        .select("id, first_name, last_name, phone, ouverture_date, services, notes")
        .eq("id", matchedContact.id)
        .single();

      if (contact) {
        const services = contact.services || [];
        const isOuverture = services.includes("ouverture");
        const isFermeture = services.includes("fermeture");

        if ((isOuverture || isFermeture) && contact.ouverture_date) {
          const jobType = isOuverture ? "ouverture" : "fermeture";
          const { data: existingJob } = await supabaseAdmin
            .from("jobs")
            .select("id")
            .eq("contact_id", contact.id)
            .eq("job_type", jobType)
            .eq("scheduled_date", contact.ouverture_date)
            .limit(1);

          if (!existingJob || existingJob.length === 0) {
            const timeMatch = contact.notes?.match(/(\d{1,2})[h:](\d{0,2})/);
            const startTime = timeMatch ? `${timeMatch[1].padStart(2, "0")}:${(timeMatch[2] || "00").padStart(2, "0")}` : "08:00";
            const startHour = parseInt(startTime.split(":")[0]);
            const endTime = `${String(startHour + 1).padStart(2, "0")}:${startTime.split(":")[1]}`;

            await supabaseAdmin.from("jobs").insert({
              contact_id: contact.id,
              job_type: jobType,
              scheduled_date: contact.ouverture_date,
              scheduled_time_start: startTime,
              scheduled_time_end: endTime,
              status: "planifié",
              confirmed_at: new Date().toISOString(),
            });

            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";
            const dateFormatted = new Date(contact.ouverture_date + "T12:00:00").toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });

            await fetch(`${baseUrl}/api/sms/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contactId: contact.id,
                body: `Bonjour ${contact.first_name}! Votre paiement a bien été reçu. Votre ${jobType} est confirmée pour le ${dateFormatted} à ${startTime}. À bientôt! — CHLORE, Entretien Piscine Granby`,
              }),
            });

            console.log(`[check-payments] Auto-confirmed ${jobType} for ${contact.first_name} on ${contact.ouverture_date}`);
          }
        }
      }
    } catch (autoConfirmErr) {
      console.error("[check-payments] Auto-confirm error:", autoConfirmErr);
    }

    // Notifier Thomas
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";
    const { data: thomas } = await supabaseAdmin.from("contacts").select("id").eq("phone", "+14509942215").single();
    if (thomas) {
      await fetch(`${baseUrl}/api/sms/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: thomas.id,
          body: `CHLORE: Paiement Interac reçu! ${matchedContact.first_name} ${matchedContact.last_name} — ${amount}$ (${matchingPayment.notes})`,
        }),
      });
    }
  } else {
    // Si le montant ne match aucun paiement en attente
    // Ne PAS créer de payment fantôme — juste notifier Thomas
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";
    const { data: thomas } = await supabaseAdmin.from("contacts").select("id").eq("phone", "+14509942215").single();
    if (thomas) {
      await fetch(`${baseUrl}/api/sms/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: thomas.id,
          body: `CHLORE: Virement Interac reçu de ${senderName} — ${amount}$, mais aucun paiement en attente ne match. Va sur /payments pour l'associer manuellement.`,
        }),
      });
    }

    await supabaseAdmin.from("automation_logs").insert({
      action: `interac_scan_${msgId}`,
      status: "unmatched",
      details: { sender: senderName, amount },
    });

    continue;
  }
} else {
  processed.push(`${senderName}: ${amount}$ → PAS DE MATCH CONTACT (à vérifier manuellement)`);
}

      // Mark as processed
      await supabaseAdmin.from("automation_logs").insert({
        action: `interac_email_${msgId}`,
        status: "success",
        details: { sender: senderName, amount, matched: !!matchedContact },
      });
    }

    return NextResponse.json({
      checked: true,
      emails_found: gmailMessages.length,
      processed,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    if (msg.includes("Google not connected")) {
      return NextResponse.json({ checked: false, reason: "Gmail not connected" });
    }

    console.error("[check-payments] Error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
