export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { validateEmployeeToken } from "@/lib/employe-auth";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("employe_session")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const employeeId = validateEmployeeToken(token);
  if (!employeeId) return NextResponse.json({ error: "Session invalide" }, { status: 401 });

  const { data: employee, error } = await supabaseAdmin
    .from("employees")
    .select("id, name, email, zone, work_days, active")
    .eq("id", employeeId)
    .single();

  if (error || !employee || !employee.active) {
    return NextResponse.json({ error: "Employé introuvable" }, { status: 401 });
  }

  return NextResponse.json({ employee });
}
