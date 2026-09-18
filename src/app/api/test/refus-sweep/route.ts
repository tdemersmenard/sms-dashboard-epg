export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sweepRefus, sendRefusWeeklyReport } from "@/lib/automations/refus-sweep";

/** Sweep refus + rapport à la demande, scopé à UNE franchise — POUR TESTS. Auth: CRON_SECRET. */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { franchiseId, report } = await req.json();
  const logs = await sweepRefus(franchiseId);
  const reportLogs = report ? await sendRefusWeeklyReport(franchiseId) : [];
  return NextResponse.json({ logs, reportLogs });
}
