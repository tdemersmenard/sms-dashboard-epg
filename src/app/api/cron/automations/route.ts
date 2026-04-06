export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { runAutomations } from "@/lib/automations/engine";

export async function GET(req: NextRequest) {
  // Verify cron secret if configured
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const results = await runAutomations();
    const succeeded = results.filter((r) => r.status === "success").length;
    const failed    = results.filter((r) => r.status === "error").length;

    // Job reminders (1 day before + 1 hour before)
    let reminderResults: string[] = [];
    try {
      const { sendJobReminders } = await import("@/lib/automations/reminders");
      reminderResults = await sendJobReminders();
      console.log("[cron] Reminders:", reminderResults);
    } catch (e) {
      console.error("[cron] Reminder error:", e);
    }

    // Auto-assign routes pour les nouveaux clients
    let routeResults: string[] = [];
    try {
      const { checkAndAutoAssign } = await import("@/lib/routes/auto-assign");
      routeResults = await checkAndAutoAssign();
      if (routeResults.length > 0) {
        console.log("[cron] Auto-assigned routes:", routeResults);
      }
    } catch (e) {
      console.error("[cron] Route auto-assign error:", e);
    }

    return NextResponse.json({
      ok: true,
      ran_at: new Date().toISOString(),
      total: results.length,
      succeeded,
      failed,
      results,
      reminders: reminderResults,
      routes: routeResults,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/automations] fatal:", err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
