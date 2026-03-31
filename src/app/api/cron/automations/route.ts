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

    console.log(`[cron/automations] ran_at=${new Date().toISOString()} actions=${results.length} ok=${succeeded} err=${failed}`);

    return NextResponse.json({
      ok: true,
      ran_at: new Date().toISOString(),
      total: results.length,
      succeeded,
      failed,
      results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/automations] fatal:", err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
