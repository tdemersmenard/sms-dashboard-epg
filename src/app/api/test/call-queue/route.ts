export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { buildCallQueue } from "@/lib/automations/call-queue";

/** Déclenche la file d'appels à la demande — POUR TESTS. Auth: CRON_SECRET. */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { franchiseId } = await req.json();
  const logs = await buildCallQueue(franchiseId);
  return NextResponse.json({ logs });
}
