export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { date, kmStart, kmEnd, notes } = await req.json();
    if (!date) return NextResponse.json({ error: "Date requise" }, { status: 400 });

    // Calculer les km business pour cette date (depuis route_state)
    let kmBusiness = 0;

    const { data: jobs } = await supabaseAdmin
      .from("jobs")
      .select("contact_id")
      .eq("scheduled_date", date)
      .eq("job_type", "entretien")
      .in("status", ["planifié", "complété"]);

    if (jobs && jobs.length > 0) {
      const { data: routeState } = await supabaseAdmin
        .from("route_state")
        .select("data")
        .eq("id", 1)
        .single();

      if (routeState?.data?.routes) {
        const dayOfWeek = new Date(date + "T12:00:00").toLocaleDateString("fr-CA", { weekday: "long" });
        const dayMap: Record<string, string> = {
          "lundi": "Lundi", "mardi": "Mardi", "mercredi": "Mercredi",
          "jeudi": "Jeudi", "vendredi": "Vendredi",
        };
        const dayName = dayMap[dayOfWeek.toLowerCase()];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dayRoute = routeState.data.routes.find((r: any) => r.day === dayName);
        if (dayRoute?.totalKm) {
          kmBusiness = Math.round(dayRoute.totalKm);
        }
      }
    }

    const { data, error } = await supabaseAdmin
      .from("odometer_logs")
      .upsert({
        date,
        km_start: kmStart,
        km_end: kmEnd,
        km_business: kmBusiness,
        notes: notes || null,
      }, { onConflict: "date" })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, log: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
