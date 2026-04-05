export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

async function getContactFromToken(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data } = await supabaseAdmin
    .from("contacts")
    .select("id, season_price, services, portal_token_expires")
    .eq("portal_token", token)
    .single();
  if (!data || new Date(data.portal_token_expires) < new Date()) return null;
  return data;
}

export async function GET(req: NextRequest) {
  const contact = await getContactFromToken(req);
  if (!contact) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { data: payments } = await supabaseAdmin
    .from("payments")
    .select("id, amount, status, method, received_date, notes, created_at")
    .eq("contact_id", contact.id)
    .neq("status", "en_attente")
    .order("created_at", { ascending: false });

  const totalPaid = (payments || [])
    .filter(p => p.status === "reçu")
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  return NextResponse.json({
    payments: payments || [],
    season_price: contact.season_price || 0,
    services: contact.services || [],
    total_paid: totalPaid,
    balance: (contact.season_price || 0) - totalPaid,
  }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
    },
  });
}
