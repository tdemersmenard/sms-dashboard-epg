export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { validateEmployeeToken } from "@/lib/employe-auth";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("employe_session")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const employeeId = validateEmployeeToken(token);
  if (!employeeId) return NextResponse.json({ error: "Session invalide" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || new Date().toISOString().split("T")[0];

  const { data: jobs, error } = await supabaseAdmin
    .from("jobs")
    .select(`
      id, contact_id, job_type, scheduled_date, scheduled_time_start, scheduled_time_end, status, notes,
      contacts (id, first_name, last_name, phone, address, email, notes)
    `)
    .eq("scheduled_date", date)
    .eq("assigned_employee_id", employeeId)
    .in("status", ["planifié", "confirmé", "en_cours"])
    .order("scheduled_time_start", { ascending: true });

  if (error) {
    // If assigned_employee_id column doesn't exist, return empty
    if (error.code === "42703") return NextResponse.json({ jobs: [], migrationRequired: true });
    return NextResponse.json({ error: error.message, jobs: [] }, { status: 500 });
  }

  return NextResponse.json({ jobs: jobs || [] });
}

export async function PATCH(req: NextRequest) {
  const token = req.cookies.get("employe_session")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const employeeId = validateEmployeeToken(token);
  if (!employeeId) return NextResponse.json({ error: "Session invalide" }, { status: 401 });

  const { jobId, status } = await req.json();
  if (!jobId || !status) return NextResponse.json({ error: "jobId et status requis" }, { status: 400 });

  // Verify the job belongs to this employee
  const { data: job } = await supabaseAdmin
    .from("jobs")
    .select("id, assigned_employee_id")
    .eq("id", jobId)
    .single();

  if (!job || job.assigned_employee_id !== employeeId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from("jobs")
    .update({ status })
    .eq("id", jobId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
