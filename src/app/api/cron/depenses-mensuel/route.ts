export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";

/**
 * Cron — le 1er de chaque mois à 8h
 * Génère et envoie par Gmail le rapport du mois précédent.
 * Schedule vercel.json: "0 12 1 * *" (8h EDT = 12h UTC)
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // Calcul du mois précédent
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const mois = prevMonth.getMonth() + 1;   // 1-12
    const annee = prevMonth.getFullYear();

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";

    const res = await fetch(`${baseUrl}/api/depenses/envoyer-rapport`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annee, mois }),
    });

    const result = await res.json();

    if (!res.ok) {
      console.error("[cron/depenses-mensuel] Error:", result);
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    }

    console.log("[cron/depenses-mensuel] Sent:", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/depenses-mensuel]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
