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

    for (const [day, routeData] of Object.entries(routes) as [string, { clients: { id: string; name: string; phone: string; estimatedArrival: string; order: number }[] }][]) {
      const dayOffset = dayToNumber[day] ?? 0;
      const firstDate = new Date(startDate);
      firstDate.setDate(firstDate.getDate() + dayOffset);

      for (const client of routeData.clients || []) {
        const currentDate = new Date(firstDate);
        const endDate = new Date("2026-09-30");
        let jobCount = 0;

        while (currentDate <= endDate) {
          const [h, m] = client.estimatedArrival.split(":").map(Number);
          const endMinutes = h * 60 + m + 45;
          const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;

          await supabaseAdmin.from("jobs").insert({
            contact_id: client.id,
            job_type: "entretien",
            scheduled_date: currentDate.toISOString().split("T")[0],
            scheduled_time_start: client.estimatedArrival,
            scheduled_time_end: endTime,
            status: "planifié",
            notes: `Route ${day} — Arrêt #${client.order}`,
          });

          jobCount++;
          currentDate.setDate(currentDate.getDate() + 7);
        }

        results.push(`${client.name}: ${jobCount} passages créés (${day})`);

        if (sendSMS && client.phone?.startsWith("+")) {
          const dayFr = day.toLowerCase();
          await fetch(`${baseUrl}/api/sms/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contactId: client.id,
              body: `Bonjour ${client.name.split(" ")[0]}! Votre entretien de piscine hebdomadaire est planifié chaque ${dayFr}, avec une arrivée estimée vers ${client.estimatedArrival}. Le premier passage sera le ${firstDate.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" })}. Si vous avez des questions, contactez-nous au 450-994-2215!`,
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
