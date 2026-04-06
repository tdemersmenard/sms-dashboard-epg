export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { routes, sendSMS } = await req.json();
    const results: string[] = [];
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";
    const dayToJS: Record<string, number> = { Dimanche: 0, Lundi: 1, Mardi: 2, Mercredi: 3, Jeudi: 4, Vendredi: 5, Samedi: 6 };
    const endDate = new Date("2026-09-30T23:59:59");

    for (const [day, data] of Object.entries(routes) as [string, any][]) {
      const targetDay = dayToJS[day];

      for (const client of (data as any).clients || []) {
        const { data: contactData } = await supabaseAdmin
          .from("contacts")
          .select("ouverture_date, first_name")
          .eq("id", client.id)
          .single();

        if (!contactData?.ouverture_date) {
          results.push(`${client.name}: IGNORÉ — pas de date d'ouverture`);
          continue;
        }

        const ouv = new Date(contactData.ouverture_date + "T12:00:00");
        const first = new Date(ouv);
        first.setDate(first.getDate() + 7);
        while (first.getDay() !== targetDay) first.setDate(first.getDate() + 1);

        // Supprimer les anciens entretiens planifiés
        await supabaseAdmin.from("jobs").delete()
          .eq("contact_id", client.id)
          .eq("job_type", "entretien")
          .eq("status", "planifié");

        const cur = new Date(first);
        const increment = client.isBiweekly ? 14 : 7;
        let count = 0;

        const arrivalMin = parseInt(client.arrival.split(":")[0]) * 60 + parseInt(client.arrival.split(":")[1]);
        const endTimeMin = arrivalMin + 60;
        const endTime = `${String(Math.floor(endTimeMin / 60)).padStart(2, "0")}:${String(endTimeMin % 60).padStart(2, "0")}`;

        while (cur <= endDate) {
          await supabaseAdmin.from("jobs").insert({
            contact_id: client.id,
            job_type: "entretien",
            scheduled_date: cur.toISOString().split("T")[0],
            scheduled_time_start: client.arrival,
            scheduled_time_end: endTime,
            status: "planifié",
            notes: `Route ${day} — Arrêt #${client.order}`,
          });
          count++;
          cur.setDate(cur.getDate() + increment);
        }

        results.push(`${client.name}: ${count} passages chaque ${day}, début ${first.toISOString().split("T")[0]}`);

        if (sendSMS && client.phone?.startsWith("+")) {
          const freq = client.isBiweekly ? "aux deux semaines" : "chaque semaine";
          const debutStr = first.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });
          await fetch(`${baseUrl}/api/sms/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contactId: client.id,
              body: `Bonjour ${contactData.first_name || client.name}! Votre entretien de piscine est planifié ${freq} le ${day.toLowerCase()}, arrivée estimée vers ${client.arrival}. Le premier passage sera le ${debutStr}. Bonne saison!`,
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
