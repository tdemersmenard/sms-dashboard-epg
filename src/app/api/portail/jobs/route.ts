export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

async function getContactFromToken(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data } = await supabaseAdmin
    .from("contacts")
    .select("id, portal_token_expires")
    .eq("portal_token", token)
    .single();
  if (!data || new Date(data.portal_token_expires) < new Date()) return null;
  return data;
}

export async function GET(req: NextRequest) {
  const contact = await getContactFromToken(req);
  if (!contact) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { data } = await supabaseAdmin
    .from("jobs")
    .select("id, job_type, scheduled_date, scheduled_time_start, status, notes")
    .eq("contact_id", contact.id)
    .order("scheduled_date", { ascending: false });

  return NextResponse.json(data || []);
}
