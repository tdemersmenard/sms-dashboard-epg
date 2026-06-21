export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { zone, employeeId } = await req.json();
  if (!zone) return NextResponse.json({ error: "zone requis" }, { status: 400 });

  const empId: string | null = employeeId || null;

  let employeeName = "Thomas";
  if (empId) {
    const { data: emp } = await supabaseAdmin.from("employees").select("name").eq("id", empId).single();
    if (emp?.name) employeeName = emp.name;
  }

  // Find all contacts in this zone (city matches zone string)
  const { data: contacts, error: fetchErr } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .ilike("city", `%${zone}%`);

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!contacts || contacts.length === 0) {
    return NextResponse.json({ ok: true, contactsUpdated: 0, jobsUpdated: 0, message: `Aucun client trouvé pour la zone "${zone}"` });
  }

  const ids = contacts.map(c => c.id);

  // Update contacts
  await supabaseAdmin.from("contacts").update({ assigned_employee_id: empId }).in("id", ids);

  // Update their future jobs
  const today = new Date().toISOString().split("T")[0];
  const { count: jobsCount } = await supabaseAdmin
    .from("jobs")
    .update({ assigned_employee_id: empId })
    .in("contact_id", ids)
    .gte("scheduled_date", today)
    .not("status", "in", "(complété,annulé)");

  return NextResponse.json({
    ok: true,
    contactsUpdated: ids.length,
    jobsUpdated: jobsCount ?? 0,
    message: `${ids.length} client${ids.length !== 1 ? "s" : ""} de "${zone}" assigné${ids.length !== 1 ? "s" : ""} à ${employeeName}`,
  });
}
