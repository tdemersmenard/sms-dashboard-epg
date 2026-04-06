export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    // Chercher tous les entretiens à venir, groupés par client
    const { data: jobs } = await supabaseAdmin
      .from("jobs")
      .select("contact_id, scheduled_date, scheduled_time_start, notes, status")
      .eq("job_type", "entretien")
      .gte("scheduled_date", new Date().toISOString().split("T")[0])
      .order("scheduled_date", { ascending: true });

    // Grouper par client et trouver le jour de route
    const clientRoutes: Record<string, any> = {};

    for (const job of jobs || []) {
      if (clientRoutes[job.contact_id]) continue; // Premier job suffit

      const routeMatch = job.notes?.match(/Route (\w+)/);
      const day = routeMatch ? routeMatch[1] : "Non assigné";

      const { data: contact } = await supabaseAdmin
        .from("contacts")
        .select("first_name, last_name, address, city, phone")
        .eq("id", job.contact_id)
        .single();

      if (!contact) continue;

      const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.phone;

      // Compter les passages restants
      const remainingJobs = (jobs || []).filter(j => j.contact_id === job.contact_id).length;

      clientRoutes[job.contact_id] = {
        id: job.contact_id,
        name,
        address: contact.address + (contact.city ? `, ${contact.city}` : ""),
        phone: contact.phone,
        day,
        time: job.scheduled_time_start?.slice(0, 5) || "?",
        nextDate: job.scheduled_date,
        remainingJobs,
        order: parseInt(job.notes?.match(/Arrêt #(\d+)/)?.[1] || "0"),
      };
    }

    // Grouper par jour
    const routesByDay: Record<string, any[]> = {};
    for (const client of Object.values(clientRoutes)) {
      if (!routesByDay[client.day]) routesByDay[client.day] = [];
      routesByDay[client.day].push(client);
    }

    // Trier chaque jour par ordre d'arrêt
    for (const day of Object.keys(routesByDay)) {
      routesByDay[day].sort((a: any, b: any) => a.order - b.order);
    }

    return NextResponse.json({
      routes: routesByDay,
      totalClients: Object.keys(clientRoutes).length,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[routes-current] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
