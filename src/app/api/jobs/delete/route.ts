export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("id");
  const contactId = searchParams.get("contactId");
  const bulk = searchParams.get("bulk");

  if (bulk === "true" && contactId) {
    const { error } = await supabaseAdmin
      .from("jobs")
      .delete()
      .eq("contact_id", contactId)
      .eq("job_type", "entretien")
      .eq("status", "planifié");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, deleted: "bulk" });
  }

  if (jobId) {
    const { error } = await supabaseAdmin
      .from("jobs")
      .delete()
      .eq("id", jobId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, deleted: jobId });
  }

  return NextResponse.json({ error: "id ou contactId requis" }, { status: 400 });
}
