export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any = {};

    const { data: contacts } = await supabaseAdmin
      .from("contacts")
      .select("first_name, last_name, address, ouverture_date, services")
      .not("services", "is", null);

    const entretien = (contacts || []).filter(c =>
      (c.services || []).some((s: string) => s.toLowerCase().includes("entretien") || s.toLowerCase().includes("spa"))
    );
    results.entretienClients = entretien.length;
    results.withAddress = entretien.filter(c => c.address && c.address.length > 5).length;
    results.withOuverture = entretien.filter(c => c.ouverture_date).length;
    results.clients = entretien.map(c => ({
      name: [c.first_name, c.last_name].filter(Boolean).join(" "),
      address: c.address || "MANQUANTE",
      ouverture: c.ouverture_date || "MANQUANTE",
    }));

    const { data: jobs } = await supabaseAdmin.from("jobs").select("job_type, status, scheduled_date").order("scheduled_date");
    results.totalJobs = (jobs || []).length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    results.jobsByType = {} as Record<string, number>;
    for (const j of jobs || []) {
      results.jobsByType[j.job_type] = (results.jobsByType[j.job_type] || 0) + 1;
    }

    const { data: payments } = await supabaseAdmin.from("payments").select("status, amount");
    results.totalPayments = (payments || []).length;
    results.paymentsEnAttente = (payments || []).filter(p => p.status === "en_attente").length;
    results.paymentsRecu = (payments || []).filter(p => p.status === "reçu").length;

    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
