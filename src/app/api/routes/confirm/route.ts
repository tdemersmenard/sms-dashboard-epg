export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { routes, startDate, sendSMS } = await req.json();

    const results: string[] = [];
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";

    // JavaScript getDay(): 0=Dimanche, 1=Lundi, 2=Mardi, 3=Mercredi, 4=Jeudi, 5=Vendredi, 6=Samedi
    const dayToJS: Record<string, number> = {
      "Dimanche": 0, "Lundi": 1, "Mardi": 2, "Mercredi": 3,
      "Jeudi": 4, "Vendredi": 5, "Samedi": 6,
    };

    for (const [day, routeData] of Object.entries(routes) as [string, any][]) {
      const targetDayOfWeek = dayToJS[day];
      if (targetDayOfWeek === undefined) continue;

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
          const ouvertureDate = new Date(ouvertureJob[0].scheduled_date + "T12:00:00");
          firstEntretienDate = new Date(ouvertureDate);
          firstEntretienDate.setDate(firstEntretienDate.getDate() + 7);

          // Ajuster au bon jour de la semaine (le jour assigné par le routing)
          while (firstEntretienDate.getDay() !== targetDayOfWeek) {
            firstEntretienDate.setDate(firstEntretienDate.getDate() + 1);
          }
        } else {
          // Pas d'ouverture planifiée — utiliser startDate
          firstEntretienDate = new Date(startDate + "T12:00:00");
          // Ajuster au bon jour
          while (firstEntretienDate.getDay() !== targetDayOfWeek) {
            firstEntretienDate.setDate(firstEntretienDate.getDate() + 1);
          }
        }

        // Créer les jobs hebdomadaires jusqu'au 30 septembre
        const endDate = new Date("2026-09-30T23:59:59");
        const currentDate = new Date(firstEntretienDate);
        let jobCount = 0;

        while (currentDate <= endDate) {
          const dateStr = currentDate.toISOString().split("T")[0];

          // Vérifier qu'un job n'existe pas déjà
          const { data: existingJob } = await supabaseAdmin
            .from("jobs")
            .select("id")
            .eq("contact_id", client.id)
            .eq("scheduled_date", dateStr)
            .eq("job_type", "entretien")
            .limit(1);

          if (!existingJob || existingJob.length === 0) {
            await supabaseAdmin.from("jobs").insert({
              contact_id: client.id,
              job_type: "entretien",
              scheduled_date: dateStr,
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

        const ouvertureStr = ouvertureJob?.[0]?.scheduled_date || "pas d'ouverture";
        const firstStr = firstEntretienDate.toISOString().split("T")[0];
        results.push(`${client.name}: ${jobCount} passages chaque ${day}, ouverture ${ouvertureStr}, premier entretien ${firstStr}`);

        // Envoyer SMS si demandé
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
