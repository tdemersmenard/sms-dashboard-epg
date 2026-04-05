export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .select("id, first_name, last_name, email, phone, address, city, pool_type, services, season_price, portal_token_expires")
    .eq("portal_token", token)
    .single();

  if (!contact) return NextResponse.json({ error: "Token invalide" }, { status: 401 });

  if (new Date(contact.portal_token_expires) < new Date()) {
    return NextResponse.json({ error: "Session expirée" }, { status: 401 });
  }

  return NextResponse.json({ client: contact }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
    },
  });
}
