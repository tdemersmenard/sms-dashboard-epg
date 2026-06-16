export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("portal_token")?.value ?? req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .select("id, portal_token_expires")
    .eq("portal_token", token)
    .single();

  if (!contact || new Date(contact.portal_token_expires) < new Date()) {
    return NextResponse.json({ error: "Session invalide" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("water_tests")
    .select("*")
    .eq("contact_id", contact.id)
    .order("tested_at", { ascending: false })
    .limit(20);

  if (error) {
    if (error.code === "42P01") return NextResponse.json({ tests: [] });
    return NextResponse.json({ error: error.message, tests: [] }, { status: 500 });
  }

  return NextResponse.json({ tests: data || [] });
}
