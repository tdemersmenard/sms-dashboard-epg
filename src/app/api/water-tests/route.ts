export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const contactId = searchParams.get("contactId");
  if (!contactId) return NextResponse.json({ error: "contactId requis" }, { status: 400 });

  try {
    const { data, error } = await supabaseAdmin
      .from("water_tests")
      .select("*")
      .eq("contact_id", contactId)
      .order("tested_at", { ascending: false })
      .limit(20);

    if (error) {
      if (error.code === "42P01") return NextResponse.json({ tests: [], migrationRequired: true });
      throw error;
    }
    return NextResponse.json({ tests: data || [] });
  } catch (err) {
    return NextResponse.json({ error: String(err), tests: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { contact_id, job_id, ph, alkalinity, chlorine, calcium_hardness, stabilizer, notes } = await req.json();
    if (!contact_id) return NextResponse.json({ error: "contact_id requis" }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("water_tests")
      .insert({
        contact_id,
        job_id: job_id || null,
        ph: ph !== "" ? Number(ph) : null,
        alkalinity: alkalinity !== "" ? Number(alkalinity) : null,
        chlorine: chlorine !== "" ? Number(chlorine) : null,
        calcium_hardness: calcium_hardness !== "" ? Number(calcium_hardness) : null,
        stabilizer: stabilizer !== "" ? Number(stabilizer) : null,
        notes: notes || null,
        tested_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, test: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
