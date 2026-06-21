export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { getActiveFranchiseId } from "@/lib/franchise-context";

export async function GET() {
  try {
    const franchiseId = await getActiveFranchiseId();
    const { data, error } = await supabaseAdmin
      .from("employees")
      .select("id, name, phone, email, zone, work_days, max_hours_per_day, active, created_at")
      .eq("franchise_id", franchiseId)
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
    const { name, phone, email, zone, work_days, max_hours_per_day, password } = await req.json();

    if (!name) {
      return NextResponse.json({ error: "Nom requis" }, { status: 400 });
    }
    if (!email) {
      return NextResponse.json({ error: "Email requis pour la connexion" }, { status: 400 });
    }
    if (!password || password.length < 4) {
      return NextResponse.json({ error: "Mot de passe requis (min 4 caractères)" }, { status: 400 });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const franchiseId = await getActiveFranchiseId();
    const { data, error } = await supabaseAdmin
      .from("employees")
      .insert({
        name,
        phone: phone || null,
        email: email.toLowerCase().trim(),
        zone: zone || "granby",
        work_days: work_days || [1, 2, 3, 4, 5],
        max_hours_per_day: max_hours_per_day || 8,
        active: true,
        password_hash,
        franchise_id: franchiseId,
      })
      .select("id, name, phone, email, zone, work_days, max_hours_per_day, active, created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, employee: data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, password, ...updates } = await req.json();

    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

    // Si un nouveau mot de passe est fourni, le hasher
    if (password && password.length >= 4) {
      updates.password_hash = await bcrypt.hash(password, 10);
    }
    if (updates.email) {
      updates.email = updates.email.toLowerCase().trim();
    }

    const franchiseId = await getActiveFranchiseId();
    const { data, error } = await supabaseAdmin
      .from("employees")
      .update(updates)
      .eq("id", id)
      .eq("franchise_id", franchiseId)
      .select("id, name, phone, email, zone, work_days, max_hours_per_day, active, created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, employee: data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
