export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { processSaison2027Lead } from "@/lib/meta-saison-2027";

/** Simulation du pipeline Saison 2027 (sans Meta) — POUR TESTS. Auth: CRON_SECRET. */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { fields, franchiseId } = await req.json();
  const logs = await processSaison2027Lead(
    fields,
    {
      leadgen_id: "SIM-" + Date.now(),
      ad_id: "12345",
      adset_id: "67890",
      campaign_id: "11111",
      form_id: "22222",
      ad_name: "Visuel A — Piscine coucher de soleil",
      campaign_name: "ALTAMAR — Saison 2027 Granby",
    },
    franchiseId,
  );
  return NextResponse.json({ logs });
}
