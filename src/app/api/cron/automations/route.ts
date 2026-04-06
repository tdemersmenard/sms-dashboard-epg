export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";

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
    const { checkAndAutoAssign } = await import("@/lib/routes/auto-assign");
    results.routes_assigned = await checkAndAutoAssign();
  } catch (e) {
    results.routes_error = String(e);
  }

  return NextResponse.json({ ok: true, ...results });
}
