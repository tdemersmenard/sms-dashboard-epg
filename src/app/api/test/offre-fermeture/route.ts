export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sendOffreFermeture } from "@/lib/automations/offre-fermeture";

export async function POST(req: NextRequest) {
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { franchiseId, today } = await req.json();
  if (!franchiseId) return NextResponse.json({ error: "franchiseId requis" }, { status: 400 });
  const logs = await sendOffreFermeture(franchiseId, today ? new Date(today) : undefined);
  return NextResponse.json({ logs });
}
