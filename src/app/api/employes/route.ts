export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("employees")
      .select("*")
      .order("name");

    if (error) {
      // Table doesn't exist yet
      if (error.code === "42P01") {
        return NextResponse.json({ employees: [], migrationRequired: true });
      }
      throw error;
    }

    return NextResponse.json({ employees: data || [] });
  } catch (e) {
    console.error("[employes GET]", e);
    return NextResponse.json({ employees: [], error: String(e) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, phone, email, zone, work_days, max_hours_per_day } = await req.json();

    if (!name) {
      return NextResponse.json({ error: "Nom requis" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("employees")
      .insert({
        name,
        phone: phone || null,
        email: email || null,
        zone: zone || "granby",
        work_days: work_days || [1, 2, 3, 4, 5],
        max_hours_per_day: max_hours_per_day || 8,
        active: true,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, employee: data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, ...updates } = await req.json();

    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("employees")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, employee: data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
