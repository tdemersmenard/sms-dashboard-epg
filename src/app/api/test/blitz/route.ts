export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { runBlitzDeadline } from "@/lib/automations/blitz-deadline";

/** Test du blitz (CRON_SECRET requis) — permet de simuler une date. */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("Authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { franchiseId, today } = await req.json();
  if (!franchiseId) return NextResponse.json({ error: "franchiseId requis" }, { status: 400 });
  const logs = await runBlitzDeadline(franchiseId, today);
  return NextResponse.json({ logs });
}
