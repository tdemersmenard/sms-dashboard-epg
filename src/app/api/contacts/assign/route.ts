export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { contactId, employeeId } = await req.json();
  if (!contactId) return NextResponse.json({ error: "contactId requis" }, { status: 400 });

  const empId: string | null = employeeId || null;

  // Fetch employee name for response
  let employeeName = "Thomas";
  if (empId) {
    const { data: emp } = await supabaseAdmin.from("employees").select("name").eq("id", empId).single();
    if (emp?.name) employeeName = emp.name;
  }

  // Update contact
  const { error: contactError } = await supabaseAdmin
    .from("contacts")
    .update({ assigned_employee_id: empId })
    .eq("id", contactId);

  if (contactError) return NextResponse.json({ error: contactError.message }, { status: 500 });

  // Update all future non-completed jobs for this contact
  const today = new Date().toISOString().split("T")[0];
  const { error: jobsError, count } = await supabaseAdmin
    .from("jobs")
    .update({ assigned_employee_id: empId })
    .eq("contact_id", contactId)
    .gte("scheduled_date", today)
    .not("status", "in", "(complété,annulé)");

  if (jobsError) return NextResponse.json({ error: jobsError.message }, { status: 500 });

  return NextResponse.json({ ok: true, jobsUpdated: count ?? 0, employeeName });
}
