export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any = { ran_at: new Date().toISOString() };

  // 1. Rappels RDV (1 jour avant + 1h avant)
  try {
    const { sendJobReminders } = await import("@/lib/automations/reminders");
    results.job_reminders = await sendJobReminders();
  } catch (e) {
    results.job_reminders_error = String(e);
  }

  // 2. Rappels paiement (jour de la due_date)
  try {
    const { sendPaymentReminders } = await import("@/lib/automations/reminders");
    results.payment_reminders = await sendPaymentReminders();
  } catch (e) {
    results.payment_reminders_error = String(e);
  }

  // 3. Auto-assign nouveaux clients aux routes
  try {
    const { autoAssignNewClients } = await import("@/lib/routes/auto-assign");
    results.routes_auto = await autoAssignNewClients();
  } catch (e) {
    results.routes_auto_error = String(e);
  }

  // 4. Relances automatiques
  try {
    const { sendFollowUps } = await import("@/lib/automations/follow-ups");
    results.follow_ups = await sendFollowUps();
  } catch (e) {
    results.follow_ups_error = String(e);
  }

  // 5. Portails manquants
  try {
    const { createMissingPortals } = await import("@/lib/automations/portal-check");
    results.portal_check = await createMissingPortals();
  } catch (e) {
    results.portal_check_error = String(e);
  }

  // 6. Batch SMS planifié — vérifie s'il y a des messages à envoyer
  try {
    const { data: pendingBatch } = await supabaseAdmin
      .from("settings")
      .select("value")
      .eq("key", "pending_sms_batch")
      .single();

    if (pendingBatch?.value) {
      const batch = JSON.parse(pendingBatch.value);
      const now = new Date();
      const montrealHour = parseInt(now.toLocaleTimeString("en-US", { timeZone: "America/Montreal", hour: "2-digit", hour12: false }));

      // Envoyer seulement entre 8h et 9h
      if (montrealHour >= 8 && montrealHour < 9) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";

        for (const id of batch.contactIds) {
          try {
            const { data: contact } = await supabaseAdmin
              .from("contacts")
              .select("first_name")
              .eq("id", id)
              .single();

            const msg = batch.message.replace("{{prénom}}", contact?.first_name?.trim() || "");

            await fetch(`${baseUrl}/api/sms/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contactId: id, body: msg }),
            });

            await new Promise(r => setTimeout(r, 1500));
          } catch (e) {
            console.error("[batch] Error:", e);
          }
        }

        // Supprimer le batch une fois envoyé
        await supabaseAdmin.from("settings").delete().eq("key", "pending_sms_batch");
        results.batch_sms = `${batch.contactIds.length} SMS envoyés`;
      }
    }
  } catch {}

  // Batch 2 — envoyer entre 10h et 11h
  try {
    const { data: pendingBatch2 } = await supabaseAdmin
      .from("settings")
      .select("value")
      .eq("key", "pending_sms_batch_2")
      .single();

    if (pendingBatch2?.value) {
      const batch = JSON.parse(pendingBatch2.value);
      const now2 = new Date();
      const montrealHour2 = parseInt(now2.toLocaleTimeString("en-US", { timeZone: "America/Montreal", hour: "2-digit", hour12: false }));

      if (montrealHour2 >= 10 && montrealHour2 < 11) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";
        for (const id of batch.contactIds) {
          try {
            const { data: contact } = await supabaseAdmin
              .from("contacts").select("first_name").eq("id", id).single();
            const msg = batch.message.replace("{{prénom}}", contact?.first_name?.trim() || "");
            await fetch(`${baseUrl}/api/sms/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contactId: id, body: msg }),
            });
            await new Promise(r => setTimeout(r, 1500));
          } catch (e) { console.error("[batch2] Error:", e); }
        }
        await supabaseAdmin.from("settings").delete().eq("key", "pending_sms_batch_2");
      }
    }
  } catch {}

  return NextResponse.json({ ok: true, ...results });
}
