export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { contactId } = await req.json();

    // Supprimer le log d'anti-doublon
    await supabaseAdmin
      .from("automation_logs")
      .delete()
      .eq("action", `route_confirmed_${contactId}`);

    // Supprimer aussi les jobs créés
    await supabaseAdmin
      .from("jobs")
      .delete()
      .eq("contact_id", contactId)
      .eq("job_type", "entretien")
      .eq("status", "planifié");

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
