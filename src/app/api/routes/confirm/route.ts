export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { routes, startDate, sendSMS } = await req.json();

    const results: string[] = [];
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";

    const dayToNumber: Record<string, number> = {
      "Lundi": 0, "Mardi": 1, "Mercredi": 2, "Jeudi": 3,
      "Vendredi": 4, "Samedi": 5, "Dimanche": 6,
    };

    for (const [day, routeData] of Object.entries(routes) as [string, any][]) {
      const dayOffset = dayToNumber[day] || 0;

      for (const client of routeData.clients || []) {
        // Chercher la date d'ouverture de ce client
        const { data: ouvertureJob } = await supabaseAdmin
          .from("jobs")
          .select("scheduled_date")
          .eq("contact_id", client.id)
          .eq("job_type", "ouverture")
          .order("scheduled_date", { ascending: false })
          .limit(1);

        let firstEntretienDate: Date;

        if (ouvertureJob && ouvertureJob.length > 0) {
          // Premier entretien = 1 semaine après l'ouverture
          const ouvertureDate = new Date(ouvertureJob[0].scheduled_date);
          firstEntretienDate = new Date(ouvertureDate);
          firstEntretienDate.setDate(firstEntretienDate.getDate() + 7);

          // Ajuster au bon jour de la semaine
          while (firstEntretienDate.getDay() !== (dayOffset === 6 ? 0 : dayOffset + 1)) {
            firstEntretienDate.setDate(firstEntretienDate.getDate() + 1);
          }
        } else {
          // Pas d'ouverture planifiée — utiliser startDate
          firstEntretienDate = new Date(startDate);
          firstEntretienDate.setDate(firstEntretienDate.getDate() + dayOffset);
        }

        // Créer les jobs hebdomadaires
        const endDate = new Date("2026-09-30");
        const currentDate = new Date(firstEntretienDate);
        let jobCount = 0;

        while (currentDate <= endDate) {
          // Vérifier qu'un job n'existe pas déjà à cette date pour ce client
          const { data: existingJob } = await supabaseAdmin
            .from("jobs")
            .select("id")
            .eq("contact_id", client.id)
            .eq("scheduled_date", currentDate.toISOString().split("T")[0])
            .eq("job_type", "entretien")
            .limit(1);

          if (!existingJob || existingJob.length === 0) {
            await supabaseAdmin.from("jobs").insert({
              contact_id: client.id,
              job_type: "entretien",
              scheduled_date: currentDate.toISOString().split("T")[0],
              scheduled_time_start: client.estimatedArrival,
              scheduled_time_end: (() => {
                const [h, m] = client.estimatedArrival.split(":").map(Number);
                const end = h * 60 + m + 45;
                return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
              })(),
              status: "planifié",
              notes: `Route ${day} — Arrêt #${client.order}`,
            });
            jobCount++;
          }

          currentDate.setDate(currentDate.getDate() + 7);
        }

        results.push(`${client.name}: ${jobCount} passages (${day}, début ${firstEntretienDate.toLocaleDateString("fr-CA")})`);

        // Send SMS if requested
        if (sendSMS && client.phone?.startsWith("+")) {
          const dayFr = day.toLowerCase();
          const debutStr = firstEntretienDate.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });
          await fetch(`${baseUrl}/api/sms/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contactId: client.id,
              body: `Bonjour ${client.name.split(" ")[0]}! Votre entretien de piscine hebdomadaire est planifié chaque ${dayFr}, arrivée estimée vers ${client.estimatedArrival}. Le premier passage sera le ${debutStr}. Bonne saison!`,
            }),
          });
          results.push(`SMS envoyé à ${client.name}`);
        }
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error("[routes-confirm] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
