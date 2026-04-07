export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const DAY_TO_JS: Record<string, number> = { Lundi: 1, Mardi: 2, Mercredi: 3, Jeudi: 4, Vendredi: 5 };

export async function POST(req: NextRequest) {
  try {
    const { stop, day } = await req.json();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";

    // Vérifier qu'on n'a pas déjà confirmé ce client (anti-doublon)
    const { data: alreadyLogged } = await supabaseAdmin
      .from("automation_logs")
      .select("id")
      .eq("action", `route_confirmed_${stop.id}`)
      .limit(1);

    if (alreadyLogged && alreadyLogged.length > 0) {
      return NextResponse.json({ error: "Client déjà confirmé" }, { status: 400 });
    }

    // Supprimer les anciens entretiens
    await supabaseAdmin.from("jobs")
      .delete()
      .eq("contact_id", stop.id)
      .eq("job_type", "entretien")
      .eq("status", "planifié");

    // Calculer le premier entretien
    const target = DAY_TO_JS[day];
    const ouv = new Date(stop.ouvertureDate + "T12:00:00");
    const first = new Date(ouv);
    first.setDate(first.getDate() + 7);
    while (first.getDay() !== target) first.setDate(first.getDate() + 1);

    const isBiweekly = stop.isBiweekly;
    const increment = isBiweekly ? 14 : 7;
    const endDate = new Date("2026-09-30T23:59:59");
    const cur = new Date(first);
    let count = 0;

    const endTimeMin = parseInt(stop.arrivalTime.split(":")[0]) * 60 + parseInt(stop.arrivalTime.split(":")[1]) + 60;
    const endTime = `${String(Math.floor(endTimeMin / 60)).padStart(2, "0")}:${String(endTimeMin % 60).padStart(2, "0")}`;

    while (cur <= endDate) {
      await supabaseAdmin.from("jobs").insert({
        contact_id: stop.id,
        job_type: "entretien",
        scheduled_date: cur.toISOString().split("T")[0],
        scheduled_time_start: stop.arrivalTime,
        scheduled_time_end: endTime,
        status: "planifié",
        notes: `Route ${day} — Arrêt #${stop.order}`,
      });
      count++;
      cur.setDate(cur.getDate() + increment);
    }

    // Envoyer le SMS
    if (stop.phone?.startsWith("+")) {
      const freq = isBiweekly ? "aux deux semaines" : "chaque semaine";
      const debutStr = first.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });
      const firstName = stop.name.split(" ")[0];
      await fetch(`${baseUrl}/api/sms/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: stop.id,
          body: `Bonjour ${firstName}! Votre entretien de piscine est planifié ${freq} le ${day.toLowerCase()}, arrivée vers ${stop.arrivalTime}. Premier passage: ${debutStr}. Bonne saison!`,
        }),
      });
    }

    // Logger pour anti-doublon
    await supabaseAdmin.from("automation_logs").insert({
      action: `route_confirmed_${stop.id}`,
      contact_id: stop.id,
      status: "success",
    });

    return NextResponse.json({ success: true, jobsCreated: count });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
