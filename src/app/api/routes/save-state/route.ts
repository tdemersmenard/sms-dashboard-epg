export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    await supabaseAdmin.from("route_state").upsert({
      id: 1,
      data,
      updated_at: new Date().toISOString(),
    });

    // Resync les jobs avec le nouveau route_state
    const routes = data.routes;
    try {
      const today = new Date().toISOString().split("T")[0];

      // 1. Supprimer tous les jobs futurs d'entretien planifiés (pas les complétés)
      await supabaseAdmin
        .from("jobs")
        .delete()
        .eq("job_type", "entretien")
        .eq("status", "planifié")
        .gte("scheduled_date", today);

      // 2. Recréer les jobs depuis le route_state
      const dayOffsets: Record<string, number> = {
        "Lundi": 0, "Mardi": 1, "Mercredi": 2, "Jeudi": 3, "Vendredi": 4,
      };

      // Trouver le prochain lundi (ou aujourd'hui si on est lundi)
      const todayDate = new Date(today + "T12:00:00");
      const dayOfWeek = todayDate.getDay(); // 0=dim, 1=lun, ..., 6=sam
      const daysUntilMonday = dayOfWeek === 0 ? 1 : (dayOfWeek === 1 ? 0 : 8 - dayOfWeek);
      const nextMonday = new Date(todayDate);
      nextMonday.setDate(todayDate.getDate() + daysUntilMonday);

      // Mais si on est avant le 20 avril 2026, partir du 20 avril
      const seasonStart = new Date("2026-04-20T12:00:00");
      const startDate = nextMonday < seasonStart ? seasonStart : nextMonday;
      const endDate = new Date("2026-09-30T12:00:00");

      const jobsToInsert: {
        contact_id: string;
        job_type: string;
        scheduled_date: string;
        scheduled_time_start: string;
        scheduled_time_end: string;
        status: string;
        notes: string;
      }[] = [];

      for (const route of routes || []) {
        const offset = dayOffsets[route.day];
        if (offset === undefined) continue;

        for (const stop of route.stops || []) {
          const startTime = stop.arrivalTime || stop.startTime || "08:00";
          const endTime = stop.departureTime || (() => {
            const [h, m] = startTime.split(":").map(Number);
            const endMinutes = h * 60 + m + 60;
            return `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
          })();
          const isBiweekly = !!stop.isBiweekly;
          const incrementDays = isBiweekly ? 14 : 7;

          // Récupérer ouverture_date du contact
          const { data: contact } = await supabaseAdmin
            .from("contacts")
            .select("ouverture_date")
            .eq("id", stop.id)
            .single();

          // Si pas d'ouverture_date, skip ce client
          if (!contact?.ouverture_date) continue;

          // Le premier entretien doit être à ou APRÈS la date d'ouverture
          const ouvertureDate = new Date(contact.ouverture_date + "T12:00:00");

          // Trouver le premier jour correspondant (offset) qui est >= ouverture_date
          const ouvertureDayOfWeek = ouvertureDate.getDay(); // 0=dim, 1=lun...
          const targetDayOfWeek = offset + 1; // offset 0 = lundi = 1

          let daysToAdd: number;
          if (ouvertureDayOfWeek <= targetDayOfWeek) {
            daysToAdd = targetDayOfWeek - ouvertureDayOfWeek;
          } else {
            daysToAdd = 7 - ouvertureDayOfWeek + targetDayOfWeek;
          }

          // Si ouverture_date est déjà sur le bon jour, premier job est 7 jours après
          if (daysToAdd === 0) {
            daysToAdd = 7;
          }

          const firstJobDate = new Date(ouvertureDate);
          firstJobDate.setDate(ouvertureDate.getDate() + daysToAdd);

          // Override currentDate pour commencer à firstJobDate
          let currentDate = firstJobDate;

          while (currentDate <= endDate) {
            const dateStr = currentDate.toISOString().split("T")[0];
            jobsToInsert.push({
              contact_id: stop.id,
              job_type: "entretien",
              scheduled_date: dateStr,
              scheduled_time_start: startTime,
              scheduled_time_end: endTime,
              status: "planifié",
              notes: `Route ${route.day}${isBiweekly ? " — aux 2 semaines" : ""}`,
            });
            currentDate.setDate(currentDate.getDate() + incrementDays);
          }
        }
      }

      // Insérer en batch
      if (jobsToInsert.length > 0) {
        await supabaseAdmin.from("jobs").insert(jobsToInsert);
      }
    } catch (resyncErr) {
      console.error("[save-state] Erreur resync jobs:", resyncErr);
      // Ne pas faire crasher, juste logger
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
